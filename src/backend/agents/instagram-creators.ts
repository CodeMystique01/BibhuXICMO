/**
 * Instagram influencer / creator discovery for outreach.
 *
 * Two-step pipeline:
 *   1. LLM plans the *seed query set* (hashtags + competitor handles)
 *   2. Apify hashtag scraper returns posts; we extract unique author handles,
 *      then run the profile scraper to get follower counts + bios.
 *   3. Batched LLM rank scores each creator's *brand fit* in one call.
 */
import { z } from "zod";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import {
  apifyScrapeHashtag,
  apifyScrapeProfiles,
  ApifyIGNotConfiguredError,
  type IGScrapedProfile,
} from "@/integrations/instagram-apify";
import type { AgentContext } from "./base";
import { formatBrandContext, MIN_IG_CREATOR_FIT } from "./instagram-keywords";

const creatorPlanSchema = z.object({
  hashtags: z.array(z.string()).min(3).max(8),
  competitorHandles: z.array(z.string()).max(5),
  followerRange: z.object({
    min: z.number().int().default(1_000),
    max: z.number().int().default(250_000),
  }),
  niche: z.string(),
});

type CreatorPlan = {
  hashtags: string[];
  competitorHandles: string[];
  followerRange: { min: number; max: number };
  niche: string;
};

const creatorScoreSchema = z.object({
  creators: z.array(
    z.object({
      handle: z.string(),
      fit: z.number().min(0).max(1),
      niche: z.string(),
      notes: z.string(),
    })
  ),
});

export type RankedIGCreator = {
  profile: IGScrapedProfile;
  fit: number;
  niche: string;
  notes: string;
};

type VoiceProfile = {
  positioning?: string;
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
};

export async function planCreatorDiscovery(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<CreatorPlan | null> {
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) return null;
  try {
    const { object } = await meteredGenerateObject(
      [
        "Plan an Instagram CREATOR / INFLUENCER outreach search.",
        formatBrandContext(ctx, voice),
        "",
        "- 3–8 niche hashtags (no #) creators in our target niche actually post under.",
        "- 0–5 competitor IG handles (no @) whose followers might fit.",
        "- A sensible follower range (default 1k–250k for micro / mid).",
        "- A one-line niche description.",
      ].join("\n"),
      creatorPlanSchema,
      { workspaceId: ctx.workspaceId, reason: "ig.creator_plan", model }
    );
    return {
      hashtags: object.hashtags,
      competitorHandles: object.competitorHandles,
      niche: object.niche,
      followerRange: {
        min: object.followerRange.min ?? 1_000,
        max: object.followerRange.max ?? 250_000,
      },
    };
  } catch (err) {
    console.warn("[ig] creator plan failed:", err);
    return null;
  }
}

async function collectCandidateHandles(
  hashtags: string[],
  perTag = 20
): Promise<{ handles: string[]; error?: string }> {
  const seen = new Set<string>();
  let configError: string | undefined;
  let lastError: string | undefined;

  for (const tag of hashtags) {
    try {
      const posts = await apifyScrapeHashtag(tag, { resultsLimit: perTag });
      for (const p of posts) {
        if (p.ownerHandle) seen.add(p.ownerHandle);
      }
    } catch (err) {
      if (err instanceof ApifyIGNotConfiguredError) {
        configError = err.message;
        break;
      }
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    handles: [...seen].slice(0, 60),
    error: configError ?? (seen.size === 0 ? lastError : undefined),
  };
}

export async function rankCreatorsWithLLM(
  ctx: AgentContext,
  voice: VoiceProfile | null,
  profiles: IGScrapedProfile[],
  niche: string,
  followerRange: { min: number; max: number }
): Promise<RankedIGCreator[]> {
  if (profiles.length === 0) return [];
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) return [];

  // Cheap pre-filter: enforce follower range before paying the LLM.
  const filtered = profiles
    .filter(
      (p) =>
        p.followers >= followerRange.min &&
        (followerRange.max === 0 || p.followers <= followerRange.max)
    )
    .slice(0, 12);
  if (filtered.length === 0) return [];

  const listing = filtered
    .map(
      (p, i) =>
        `[${i + 1}] @${p.handle} | ${p.followers.toLocaleString()} followers${p.isVerified ? " ✓" : ""}` +
        `${p.bio ? `\n    bio: ${p.bio.slice(0, 240)}` : ""}`
    )
    .join("\n");

  const { object } = await meteredGenerateObject(
    [
      "Score each Instagram creator for brand fit. One entry per @handle.",
      "",
      formatBrandContext(ctx, voice),
      `Target niche: ${niche}`,
      "",
      "Scoring:",
      "- 0.0–0.3: wrong niche, fake-looking, or no overlap.",
      "- 0.4–0.6: tangential — might work with a creative angle.",
      "- 0.7+: strong fit — audience overlaps, content style fits brand.",
      "- 0.9+: ideal partner.",
      "",
      "Creators:",
      listing,
    ].join("\n"),
    creatorScoreSchema,
    { workspaceId: ctx.workspaceId, reason: "ig.creator_rank", model }
  );

  const byHandle = new Map(filtered.map((p) => [p.handle.toLowerCase(), p]));
  const ranked: RankedIGCreator[] = [];
  for (const row of object.creators) {
    const profile = byHandle.get(row.handle.toLowerCase().replace(/^@/, ""));
    if (!profile) continue;
    ranked.push({
      profile,
      fit: row.fit,
      niche: row.niche,
      notes: row.notes,
    });
  }
  ranked.sort((a, b) => b.fit - a.fit);
  return ranked;
}

export async function discoverIGCreators(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{
  ranked: RankedIGCreator[];
  niche: string;
  scanned: number;
  error?: string;
}> {
  const plan = await planCreatorDiscovery(ctx, voice);
  if (!plan) {
    return { ranked: [], niche: "", scanned: 0, error: "No LLM available." };
  }

  const { handles, error: scrapeError } = await collectCandidateHandles(
    plan.hashtags
  );
  if (scrapeError && handles.length === 0) {
    return { ranked: [], niche: plan.niche, scanned: 0, error: scrapeError };
  }

  let profiles: IGScrapedProfile[] = [];
  try {
    profiles = await apifyScrapeProfiles(handles, { resultsLimit: handles.length });
  } catch (err) {
    if (err instanceof ApifyIGNotConfiguredError) {
      return { ranked: [], niche: plan.niche, scanned: 0, error: err.message };
    }
    console.warn("[ig] profile scrape failed:", err);
  }

  const ranked = await rankCreatorsWithLLM(
    ctx,
    voice,
    profiles,
    plan.niche,
    plan.followerRange
  );
  return { ranked, niche: plan.niche, scanned: profiles.length };
}

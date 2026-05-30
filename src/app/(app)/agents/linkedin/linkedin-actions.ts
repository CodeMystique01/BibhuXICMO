"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import {
  runCompanyPosts,
  runProfile,
  pollLinkedInTool,
  type CachedLinkedInResult,
  type LinkedInPollInput,
  type LinkedInPollResult,
} from "@/backend/linkedin-tools";
import type {
  LinkedInCompanyPostsResult,
  LinkedInProfileResult,
  LinkedInProfile,
} from "@/integrations/linkedin-apify";

// --------------------------------------------------------------------------
// Apify scans (async start + poll)
// --------------------------------------------------------------------------

export async function startCompanyPostsAction(args: {
  targets: string[];
  maxPosts?: number;
  includeReposts?: boolean;
}): Promise<CachedLinkedInResult<LinkedInCompanyPostsResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runCompanyPosts({ workspaceId: workspace.id, ...args });
  if (res.ok && !("pending" in res)) revalidatePath("/agents/linkedin");
  return res;
}

export async function startProfileAction(args: {
  query: string;
}): Promise<CachedLinkedInResult<LinkedInProfileResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runProfile({ workspaceId: workspace.id, query: args.query });
  if (res.ok && !("pending" in res)) revalidatePath("/agents/linkedin");
  return res;
}

export async function pollLinkedInToolAction(
  input: LinkedInPollInput
): Promise<LinkedInPollResult> {
  const { workspace } = await requireWorkspace();
  const res = await pollLinkedInTool(workspace.id, input);
  if (res.ok && res.status === "DONE") revalidatePath("/agents/linkedin");
  return res;
}

// --------------------------------------------------------------------------
// LLM step 1 — analyze company posts → insights + 3 brand-voice drafts
// --------------------------------------------------------------------------

const insightsSchema = z.object({
  summary: z.string(),
  whatWorks: z.array(z.string()).max(6),
  contentGaps: z.array(z.string()).max(4),
  drafts: z
    .array(
      z.object({
        hook: z.string(),
        body: z.string().min(120).max(3000),
        hashtags: z.array(z.string()).max(5),
        rationale: z.string(),
      })
    )
    .max(3),
});

export type CompanyPostsInsights = z.infer<typeof insightsSchema> & {
  draftIds: string[];
};

export type AnalyzeResult =
  | { ok: true; data: CompanyPostsInsights }
  | { ok: false; error: string };

const ANALYZE_SYSTEM = `You are a B2B content strategist. You analyze a competitor's or peer's recent LinkedIn posts and extract what drives engagement, then write fresh posts for OUR brand (never copying theirs). LinkedIn rules: first line is a hook under 100 chars, short paragraphs, 1000-2200 chars total, lead with insight, end with a question or CTA, at most 3 hashtags.`;

export async function analyzeCompanyPostsAction(args: {
  result: LinkedInCompanyPostsResult;
}): Promise<AnalyzeResult> {
  const { workspace } = await requireWorkspace();

  const posts = args.result.posts.slice(0, 20);
  if (posts.length === 0) {
    return { ok: false, error: "No posts to analyze." };
  }

  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) {
    return {
      ok: false,
      error: "No LLM provider configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    };
  }

  const voice = workspace.voiceProfile as
    | { tone?: string; styleGuidelines?: string[]; positioning?: string }
    | null;

  const postLines = posts
    .map(
      (p, i) =>
        `${i + 1}. [${p.totalEngagement} eng · ${p.likes}♥ ${p.comments}💬 ${p.shares}🔁] ${p.content.slice(0, 400).replace(/\s+/g, " ")}`
    )
    .join("\n");

  const prompt = [
    `OUR brand positioning: ${voice?.positioning || workspace.industry || workspace.websiteUrl || "unknown"}`,
    `OUR voice tone: ${voice?.tone || "authoritative but human"}`,
    voice?.styleGuidelines?.length ? `OUR style: ${voice.styleGuidelines.join(", ")}` : "",
    workspace.icp ? `OUR ideal customer: ${workspace.icp}` : "",
    "",
    `Scraped LinkedIn posts from: ${args.result.targets.join(", ")} (sorted by engagement):`,
    postLines,
    "",
    "Tasks:",
    "1. summary: 2-3 sentences on the overall content strategy you observe.",
    "2. whatWorks: concrete patterns driving engagement (hooks, formats, topics, cadence).",
    "3. contentGaps: angles they miss that OUR brand could own.",
    "4. drafts: up to 3 original LinkedIn posts for OUR brand inspired by what works (do NOT copy their text). Each with a hook, body, hashtags, and a one-line rationale.",
  ]
    .filter(Boolean)
    .join("\n");

  let object: z.infer<typeof insightsSchema>;
  try {
    const res = await meteredGenerateObject(prompt, insightsSchema, {
      workspaceId: workspace.id,
      reason: "linkedin.analyze_posts",
      model,
      system: ANALYZE_SYSTEM,
    });
    object = res.object;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Analysis failed." };
  }

  // Persist the generated drafts so they show in the Drafts list + /content.
  const draftIds: string[] = [];
  for (const d of object.drafts) {
    const body = `${d.hook}\n\n${d.body}${
      d.hashtags.length
        ? `\n\n${d.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`
        : ""
    }`;
    try {
      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: workspace.id,
          agent: "linkedin",
          channel: "LINKEDIN",
          title: d.hook.slice(0, 100),
          body,
          meta: { hashtags: d.hashtags, source: "company_posts", rationale: d.rationale },
          status: "PENDING_APPROVAL",
        },
      });
      draftIds.push(draft.id);
    } catch (err) {
      console.error("[linkedin] draft create failed:", err);
    }
  }

  revalidatePath("/agents/linkedin");
  return { ok: true, data: { ...object, draftIds } };
}

// --------------------------------------------------------------------------
// LLM step 2 — profile → personalized outreach
// --------------------------------------------------------------------------

const outreachSchema = z.object({
  connectionNote: z.string().max(300),
  dm: z.string().max(1200),
  talkingPoints: z.array(z.string()).max(6),
  commonGround: z.array(z.string()).max(5),
});

export type ProfileOutreach = z.infer<typeof outreachSchema>;

export type OutreachResult =
  | { ok: true; data: ProfileOutreach }
  | { ok: false; error: string };

const OUTREACH_SYSTEM = `You write warm, specific, non-spammy LinkedIn outreach for a B2B seller. Reference real details from the prospect's profile. The connection note must be under 300 characters (LinkedIn's limit). The DM should be 3-5 short sentences, lead with relevance, and end with a soft ask. Never be sycophantic or use "I came across your profile".`;

export async function draftProfileOutreachAction(args: {
  profile: LinkedInProfile;
}): Promise<OutreachResult> {
  const { workspace } = await requireWorkspace();
  const p = args.profile;

  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) {
    return {
      ok: false,
      error: "No LLM provider configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    };
  }

  const voice = workspace.voiceProfile as
    | { tone?: string; positioning?: string }
    | null;

  const prompt = [
    `OUR brand: ${voice?.positioning || workspace.industry || workspace.websiteUrl || "unknown"}`,
    workspace.icp ? `OUR ideal customer: ${workspace.icp}` : "",
    "",
    "Prospect profile:",
    `- Name: ${p.fullName}`,
    p.headline ? `- Headline: ${p.headline}` : "",
    p.currentCompany ? `- Current company: ${p.currentCompany}` : "",
    p.location ? `- Location: ${p.location}` : "",
    p.about ? `- About: ${p.about.slice(0, 600)}` : "",
    p.experience.length
      ? `- Experience: ${p.experience.slice(0, 4).map((e) => `${e.position ?? "?"} @ ${e.company ?? "?"}`).join("; ")}`
      : "",
    p.skills.length ? `- Skills: ${p.skills.slice(0, 12).join(", ")}` : "",
    "",
    "Write personalized outreach: a connection note, a follow-up DM, key talking points, and genuine common ground to reference.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await meteredGenerateObject(prompt, outreachSchema, {
      workspaceId: workspace.id,
      reason: "linkedin.outreach",
      model,
      system: OUTREACH_SYSTEM,
    });
    return { ok: true, data: res.object };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Draft failed." };
  }
}

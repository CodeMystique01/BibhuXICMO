"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { normalizeUrl } from "@/backend/scraper/fetch";
import { extractSocialHandles, type SocialHandles } from "@/backend/social-extractor";
import type { CmoVoiceProfile } from "@/backend/agents/cmo-data";

const schema = z.object({
  name: z.string().min(1).max(100),
  websiteUrl: z.string().optional(),
  industry: z.string().max(80).optional(),
  icp: z.string().max(400).optional(),
});

export async function updateWorkspaceAction(
  _prev: unknown,
  formData: FormData
): Promise<
  | { ok: true; resetStrategy?: boolean }
  | { ok: false; error: string }
> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  const parsed = schema.safeParse({
    name: formData.get("name"),
    websiteUrl: formData.get("websiteUrl") || undefined,
    industry: formData.get("industry") || undefined,
    icp: formData.get("icp") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  const nextUrl = parsed.data.websiteUrl ? normalizeUrl(parsed.data.websiteUrl) : null;
  const prevUrl = workspace.websiteUrl;

  /** Normalize comparison so http vs https and trailing slashes do not falsely skip reset. */
  const urlChanged =
    (prevUrl ?? "").replace(/\/$/, "") !== (nextUrl ?? "").replace(/\/$/, "");

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      name: parsed.data.name,
      websiteUrl: nextUrl,
      industry: urlChanged ? null : parsed.data.industry?.trim() || null,
      icp: urlChanged ? null : parsed.data.icp?.trim() || null,
      ...(urlChanged
        ? {
            voiceProfile: Prisma.DbNull,
            cmoLlmSnapshot: Prisma.DbNull,
            ahrefsSnapshot: Prisma.DbNull,
            ahrefsSnapshotAt: null,
          }
        : {}),
    },
  });

  if (urlChanged) {
    const { invalidateStaleHNDrafts } = await import("@/backend/agents/hn-stale");
    const { invalidateStaleXDrafts } = await import("@/backend/agents/x-stale");
    await Promise.all([
      invalidateStaleHNDrafts(workspace.id, nextUrl),
      invalidateStaleXDrafts(workspace.id, nextUrl),
    ]);
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/agent/cmo");
  revalidatePath("/agents/hn");
  revalidatePath("/agents/x");
  revalidatePath("/content");
  revalidatePath("/queue");
  return { ok: true as const, resetStrategy: urlChanged };
}


/**
 * Auto-detect the workspace's official social handles from its website
 * (Claude + regex). Merges into voiceProfile.socialHandles without
 * clobbering other voice fields. Manual edits via saveSocialHandlesAction
 * always override an auto-detection.
 */
export async function autoDetectSocialHandlesAction(): Promise<
  | { ok: true; handles: SocialHandles; source: "claude" | "regex" | "empty" }
  | { ok: false; error: string }
> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  if (!workspace.websiteUrl) {
    return { ok: false, error: "Add a website URL above first, then auto-detect." };
  }

  let result: Awaited<ReturnType<typeof extractSocialHandles>>;
  try {
    result = await extractSocialHandles(workspace.websiteUrl);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not fetch the website.",
    };
  }

  const prev = (workspace.voiceProfile as CmoVoiceProfile | null) ?? {};
  const nextVoice: CmoVoiceProfile = {
    ...prev,
    socialHandles: { ...(prev.socialHandles ?? {}), ...result.handles },
  };

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { voiceProfile: nextVoice as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  revalidatePath("/agent/cmo");
  return { ok: true, handles: result.handles, source: result.source };
}

const handlesSchema = z.object({
  twitter: z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  linkedin: z.string().max(200).optional(),
  facebook: z.string().max(200).optional(),
  youtube: z.string().max(200).optional(),
  github: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
});

/** Manually save social handles (overrides auto-detected values). */
export async function saveSocialHandlesAction(
  _prev: unknown,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });

  const parsed = handlesSchema.safeParse({
    twitter: (formData.get("twitter") as string) || undefined,
    instagram: (formData.get("instagram") as string) || undefined,
    linkedin: (formData.get("linkedin") as string) || undefined,
    facebook: (formData.get("facebook") as string) || undefined,
    youtube: (formData.get("youtube") as string) || undefined,
    github: (formData.get("github") as string) || undefined,
    tiktok: (formData.get("tiktok") as string) || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid handles" };
  }

  // Drop blank strings so empty inputs don't shadow previously stored values
  // — that would be surprising. To delete a handle, the UI sends a single
  // sentinel value "-" (set by the clear button) which we treat as remove.
  const cleaned: SocialHandles = {};
  for (const [k, raw] of Object.entries(parsed.data) as Array<
    [keyof SocialHandles, string | undefined]
  >) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-") continue;
    cleaned[k] = trimmed;
  }

  const prev = (workspace.voiceProfile as CmoVoiceProfile | null) ?? {};
  const nextVoice: CmoVoiceProfile = { ...prev, socialHandles: cleaned };

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { voiceProfile: nextVoice as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  revalidatePath("/agent/cmo");
  return { ok: true };
}

/**
 * Force a fresh audit on the current workspace's URL: clears the cached
 * voiceProfile, cmoLlmSnapshot, and ahrefsSnapshot so the next dashboard
 * load re-runs Claude strategy + Apify Ahrefs + PageSpeed from scratch.
 *
 * Used by SiteQuickAdd so 'Change site' followed by the same URL still
 * triggers a full re-audit (otherwise updateWorkspaceAction notices the
 * URL didn't change and skips the cache reset).
 */
export async function forceReauditAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  try {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        voiceProfile: Prisma.DbNull,
        cmoLlmSnapshot: Prisma.DbNull,
        ahrefsSnapshot: Prisma.DbNull,
        ahrefsSnapshotAt: null,
      },
    });
    revalidatePath("/agent/cmo");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reset workspace caches.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { hasSeoApifyToken } from "@/backend/ahrefs-tools";
import {
  runAiVisibility,
  hashInput,
} from "@/backend/seo-tools-cache";
import type { AiVisibilityResult } from "@/backend/ahrefs-tools";
import type {
  AiCitationsActionResult,
  AiCitationsBundle,
  PlatformCounts,
  PlatformKey,
} from "./ai-citations-types";

// ---------------------------------------------------------------------------
// Source of truth: a single Apify `AI_VISIBILITY` run on the Ahrefs scraper.
// The actor returns per-platform citation counts (ChatGPT, Gemini,
// Perplexity, Copilot, GoogleAIOverviews, GoogleAIMode) plus monthly trends
// in one call. Result is cached for 24h via SeoToolRun. No LLM probes.
// ---------------------------------------------------------------------------

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function brandFromDomain(domain: string): string {
  const s = normalizeDomain(domain);
  if (!s) return "";
  const root = s.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function avResultToBundle(
  result: AiVisibilityResult,
  domain: string,
  fetchedAt: Date
): AiCitationsBundle {
  const current: Partial<Record<PlatformKey, PlatformCounts>> = {};
  const previous: Partial<Record<PlatformKey, PlatformCounts>> = {};
  for (const row of result.byProvider) {
    if (!isPlatformKey(row.platform)) continue;
    const key = row.platform as PlatformKey;
    current[key] = {
      citations: row.citations ?? 0,
      // Pages aren't broken out per platform — show "—" until we surface
      // the cited_pages-per-model field if/when the actor adds it.
      pages: 0,
    };
    if (row.priorMonthCitations !== null) {
      previous[key] = {
        citations: row.priorMonthCitations ?? 0,
        pages: 0,
      };
    }
  }
  return {
    domain,
    country: "us",
    fetchedAt: fetchedAt.toISOString(),
    previousAt: null,
    current,
    previous,
  };
}

function isPlatformKey(s: string): s is PlatformKey {
  return (
    s === "aiOverviews" ||
    s === "chatgpt" ||
    s === "gemini" ||
    s === "perplexity" ||
    s === "copilot" ||
    s === "grok"
  );
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/**
 * Load whatever's already cached in `SeoToolRun` for AI_VISIBILITY. Does
 * NOT trigger a fresh Apify run — that's `startAiCitationsRunAction`.
 * Returns null bundle when there's no cached result yet.
 */
export async function loadAiCitationsAction(args?: {
  domain?: string;
  keyword?: string;
}): Promise<AiCitationsActionResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: true, data: null };
  const keyword = (args?.keyword ?? brandFromDomain(domain)).trim();
  if (!keyword) return { ok: true, data: null };

  const ih = hashInput({ keyword, country: "us", tool: "AI_VISIBILITY" });
  const row = await prisma.seoToolRun.findUnique({
    where: {
      workspaceId_tool_inputHash: {
        workspaceId: workspace.id,
        tool: "AI_VISIBILITY",
        inputHash: ih,
      },
    },
  });
  if (!row) return { ok: true, data: null };
  const result = row.result as AiVisibilityResult;
  return { ok: true, data: avResultToBundle(result, domain, row.createdAt) };
}

export type StartRunResult =
  | { ok: true; pending: true; runId: string; datasetId: string }
  | { ok: true; pending: false; data: AiCitationsBundle | null }
  | { ok: false; error: string };

/**
 * Start (or hit cache for) a fresh Apify AI_VISIBILITY run. Returns either
 * a pending handle for the client to poll, or the cached result if a
 * recent run exists.
 */
export async function startAiCitationsRunAction(args?: {
  domain?: string;
  keyword?: string;
}): Promise<StartRunResult> {
  if (!hasSeoApifyToken()) {
    return {
      ok: false,
      error: "Apify token not set. Add APIFY_SEO_TOKEN (or APIFY_TOKEN).",
    };
  }
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) {
    return { ok: false, error: "Workspace has no website URL." };
  }
  const keyword = (args?.keyword ?? brandFromDomain(domain)).trim();
  if (!keyword) {
    return { ok: false, error: "Couldn't infer a brand name from the domain." };
  }

  const res = await runAiVisibility({
    workspaceId: workspace.id,
    keyword,
    country: "us",
  });
  if (!res.ok) return { ok: false, error: res.error };
  if ("pending" in res) {
    return { ok: true, pending: true, runId: res.runId, datasetId: res.datasetId };
  }
  // Cache hit — return the bundle directly.
  revalidatePath("/agents/geo");
  return {
    ok: true,
    pending: false,
    data: avResultToBundle(res.data, domain, res.cachedAt),
  };
}

/**
 * Apify poll → bundle conversion. The client polls this until status DONE.
 */
export type PollRunResult =
  | { ok: true; status: "RUNNING"; message?: string }
  | { ok: true; status: "DONE"; data: AiCitationsBundle }
  | { ok: false; error: string };

export async function pollAiCitationsRunAction(args: {
  runId: string;
  datasetId: string;
  domain?: string;
  keyword?: string;
}): Promise<PollRunResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: false, error: "Workspace has no website URL." };
  const keyword = (args.keyword ?? brandFromDomain(domain)).trim();
  if (!keyword) return { ok: false, error: "Couldn't infer a brand name." };

  const { pollSeoTool } = await import("@/backend/seo-tools-cache");
  const res = await pollSeoTool(workspace.id, {
    tool: "AI_VISIBILITY",
    keyword,
    country: "us",
    runId: args.runId,
    datasetId: args.datasetId,
  });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.status === "RUNNING") {
    return { ok: true, status: "RUNNING", message: res.statusMessage };
  }
  const data = res.data as AiVisibilityResult;
  revalidatePath("/agents/geo");
  return {
    ok: true,
    status: "DONE",
    data: avResultToBundle(data, domain, res.cachedAt),
  };
}

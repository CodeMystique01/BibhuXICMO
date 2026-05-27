/**
 * Async dispatcher + DB-backed cache for the SEO/GEO keyword tools.
 *
 * Why async: the Ahrefs Apify scraper often needs 60-90s to finish, and
 * Render kills server-action HTTP requests at ~60s. So we:
 *
 *   1. Start the Apify run synchronously (returns instantly).
 *   2. Return {pending: true, runId, datasetId} to the client.
 *   3. Client polls a generic pollSeoToolAction({tool, runId, ...args}).
 *   4. When the run succeeds we fetch the dataset, normalize, persist to
 *      `SeoToolRun`, and return data. Subsequent same-input requests hit
 *      the 24h cache and return instantly.
 */
import { createHash } from "crypto";
import type { Prisma, SeoTool } from "@prisma/client";
import { prisma } from "@/backend/db";
import {
  ApifyNotConfiguredError,
  ApifyAhrefsError,
} from "@/backend/ahrefs";
import {
  getActorRunStatus,
  getDatasetItems,
  isTerminalApifyStatus,
  startKeywordDifficulty,
  startKeywordMetrics,
  startKeywordRank,
  startSerpOverview,
  startTopWebsites,
  startAiVisibility,
  normalizeKeywordDifficulty,
  normalizeKeywordMetrics,
  normalizeKeywordRank,
  normalizeSerpOverview,
  normalizeTopWebsites,
  normalizeAiVisibility,
  type KeywordDifficultyResult,
  type KeywordMetricsResult,
  type KeywordRankResult,
  type SerpOverviewResult,
  type TopWebsitesResult,
  type AiVisibilityResult,
} from "@/backend/ahrefs-tools";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------------
// Shared types
// --------------------------------------------------------------------------

export type CachedToolResult<T> =
  | { ok: true; data: T; cachedAt: Date; fromCache: boolean }
  | { ok: true; pending: true; runId: string; datasetId: string; message: string }
  | { ok: false; error: string };

/** Inputs supported by the unified poll action. */
export type SeoToolPollInput =
  | { tool: "KEYWORD_DIFFICULTY"; keyword: string; country: string; runId: string; datasetId: string }
  | { tool: "KEYWORD_METRICS"; keyword: string; country: string; runId: string; datasetId: string }
  | { tool: "KEYWORD_RANK"; domain: string; keyword: string; country: string; runId: string; datasetId: string }
  | { tool: "SERP_OVERVIEW"; keyword: string; country: string; runId: string; datasetId: string }
  | { tool: "TOP_WEBSITES"; country: string; category: string | null; runId: string; datasetId: string }
  | { tool: "AI_VISIBILITY"; keyword: string; country: string; runId: string; datasetId: string };

// --------------------------------------------------------------------------
// DB cache I/O
// --------------------------------------------------------------------------

export function hashInput(input: Record<string, unknown>): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

async function readCached<T>(args: {
  workspaceId: string;
  tool: SeoTool;
  inputHash: string;
  ttlMs: number;
}): Promise<{ result: T; cachedAt: Date } | null> {
  try {
    const row = await prisma.seoToolRun.findUnique({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: args.tool,
          inputHash: args.inputHash,
        },
      },
    });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > args.ttlMs) return null;
    return { result: row.result as T, cachedAt: row.createdAt };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return null;
    throw err;
  }
}

async function writeCached(args: {
  workspaceId: string;
  tool: SeoTool;
  inputHash: string;
  input: Record<string, unknown>;
  result: unknown;
}): Promise<void> {
  try {
    await prisma.seoToolRun.upsert({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: args.tool,
          inputHash: args.inputHash,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        tool: args.tool,
        inputHash: args.inputHash,
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
      },
      update: {
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021" && code !== "P2022") {
      console.error(`[seo-tools] write failed for ${args.tool}:`, err);
    }
  }
}

// --------------------------------------------------------------------------
// Start handlers — kick off Apify, return pending handle.
// --------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof ApifyNotConfiguredError) {
    return "Apify token isn't configured. Set APIFY_SEO_TOKEN (or APIFY_TOKEN) in Render → Environment to enable keyword tools.";
  }
  if (err instanceof ApifyAhrefsError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeDomainArg(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return s;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

const PENDING_MSG = "Apify run started. Results usually arrive in 30-90 seconds.";

export async function runKeywordDifficulty(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordDifficultyResult>> {
  const input = {
    keyword: args.keyword.trim().toLowerCase(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_DIFFICULTY" });

  const cached = await readCached<KeywordDifficultyResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_DIFFICULTY",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startKeywordDifficulty(input.keyword, input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runKeywordMetrics(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordMetricsResult>> {
  const input = {
    keyword: args.keyword.trim().toLowerCase(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_METRICS" });

  const cached = await readCached<KeywordMetricsResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_METRICS",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startKeywordMetrics(input.keyword, input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runKeywordRank(args: {
  workspaceId: string;
  domain: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordRankResult>> {
  const input = {
    domain: normalizeDomainArg(args.domain),
    keyword: args.keyword.trim().toLowerCase(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.domain) return { ok: false, error: "Enter a domain." };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_RANK" });

  const cached = await readCached<KeywordRankResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_RANK",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startKeywordRank(input.domain, input.keyword, input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runSerpOverview(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<SerpOverviewResult>> {
  const input = {
    keyword: args.keyword.trim().toLowerCase(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "SERP_OVERVIEW" });

  const cached = await readCached<SerpOverviewResult>({
    workspaceId: args.workspaceId,
    tool: "SERP_OVERVIEW",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startSerpOverview(input.keyword, input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runTopWebsites(args: {
  workspaceId: string;
  country?: string;
  category?: string | null;
}): Promise<CachedToolResult<TopWebsitesResult>> {
  const input = {
    country: (args.country ?? "us").toLowerCase(),
    category: (args.category ?? "").trim().toLowerCase() || null,
  };
  const inputHash = hashInput({ ...input, tool: "TOP_WEBSITES" });

  const cached = await readCached<TopWebsitesResult>({
    workspaceId: args.workspaceId,
    tool: "TOP_WEBSITES",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startTopWebsites(input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runAiVisibility(args: {
  workspaceId: string;
  /** Brand or keyword to query for AI citations. */
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<AiVisibilityResult>> {
  const input = {
    keyword: args.keyword.trim(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.keyword) return { ok: false, error: "Enter a brand name or keyword." };
  const inputHash = hashInput({ ...input, tool: "AI_VISIBILITY" });

  const cached = await readCached<AiVisibilityResult>({
    workspaceId: args.workspaceId,
    tool: "AI_VISIBILITY",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const handle = await startAiVisibility(input.keyword, input.country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId, message: PENDING_MSG };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// --------------------------------------------------------------------------
// Unified poll — finishes whichever tool the client kicked off.
// --------------------------------------------------------------------------

export type SeoToolPollResult =
  | { ok: true; status: "RUNNING"; statusMessage?: string }
  | { ok: true; status: "DONE"; data: KeywordDifficultyResult | KeywordMetricsResult | KeywordRankResult | SerpOverviewResult | TopWebsitesResult | AiVisibilityResult; cachedAt: Date }
  | { ok: false; error: string };

export async function pollSeoTool(
  workspaceId: string,
  input: SeoToolPollInput
): Promise<SeoToolPollResult> {
  let status: { status: string; statusMessage?: string; datasetId?: string };
  try {
    status = await getActorRunStatus(input.runId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  if (!isTerminalApifyStatus(status.status)) {
    return { ok: true, status: "RUNNING", statusMessage: status.statusMessage };
  }
  if (status.status !== "SUCCEEDED") {
    return {
      ok: false,
      error: `Apify run ${status.status}${status.statusMessage ? ` — ${status.statusMessage}` : ""}`,
    };
  }

  // SUCCEEDED — fetch + normalize per tool
  let items: unknown[];
  try {
    items = await getDatasetItems(status.datasetId ?? input.datasetId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  switch (input.tool) {
    case "KEYWORD_DIFFICULTY": {
      const data = normalizeKeywordDifficulty(items, {
        keyword: input.keyword,
        country: input.country,
      });
      const ih = hashInput({ keyword: input.keyword, country: input.country, tool: "KEYWORD_DIFFICULTY" });
      await writeCached({
        workspaceId,
        tool: "KEYWORD_DIFFICULTY",
        inputHash: ih,
        input: { keyword: input.keyword, country: input.country },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
    case "KEYWORD_METRICS": {
      const data = normalizeKeywordMetrics(items, {
        keyword: input.keyword,
        country: input.country,
      });
      const ih = hashInput({ keyword: input.keyword, country: input.country, tool: "KEYWORD_METRICS" });
      await writeCached({
        workspaceId,
        tool: "KEYWORD_METRICS",
        inputHash: ih,
        input: { keyword: input.keyword, country: input.country },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
    case "KEYWORD_RANK": {
      const data = normalizeKeywordRank(items, {
        domain: input.domain,
        keyword: input.keyword,
        country: input.country,
      });
      const ih = hashInput({
        domain: input.domain,
        keyword: input.keyword,
        country: input.country,
        tool: "KEYWORD_RANK",
      });
      await writeCached({
        workspaceId,
        tool: "KEYWORD_RANK",
        inputHash: ih,
        input: { domain: input.domain, keyword: input.keyword, country: input.country },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
    case "SERP_OVERVIEW": {
      const data = normalizeSerpOverview(items, {
        keyword: input.keyword,
        country: input.country,
      });
      const ih = hashInput({ keyword: input.keyword, country: input.country, tool: "SERP_OVERVIEW" });
      await writeCached({
        workspaceId,
        tool: "SERP_OVERVIEW",
        inputHash: ih,
        input: { keyword: input.keyword, country: input.country },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
    case "TOP_WEBSITES": {
      const data = normalizeTopWebsites(items, {
        country: input.country,
        category: input.category,
      });
      const ih = hashInput({ country: input.country, category: input.category, tool: "TOP_WEBSITES" });
      await writeCached({
        workspaceId,
        tool: "TOP_WEBSITES",
        inputHash: ih,
        input: { country: input.country, category: input.category },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
    case "AI_VISIBILITY": {
      const data = normalizeAiVisibility(items, { keyword: input.keyword });
      const ih = hashInput({ keyword: input.keyword, country: input.country, tool: "AI_VISIBILITY" });
      await writeCached({
        workspaceId,
        tool: "AI_VISIBILITY",
        inputHash: ih,
        input: { keyword: input.keyword, country: input.country },
        result: data,
      });
      return { ok: true, status: "DONE", data, cachedAt: new Date() };
    }
  }
}

"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, SeoTool } from "@prisma/client";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  meteredGenerateObject,
  pickAvailableModel,
  listAvailableProviders,
} from "@/backend/llm";
import {
  runAiVisibility,
  runKeywordMetrics,
  runSerpOverview,
  runTopWebsites,
  type CachedToolResult,
} from "@/backend/seo-tools-cache";
import type {
  AiVisibilityResult,
  KeywordMetricsResult,
  SerpOverviewResult,
  TopWebsitesResult,
} from "@/backend/ahrefs-tools";

// --------------------------------------------------------------------------
// 1) AI Visibility — Apify (async, may return pending)
//
// The actor requires a `keyword` (brand or topic). Accept either explicit
// `keyword` or a legacy `domain` arg — when only `domain` is passed we
// extract the root subdomain as the brand name (github.com → github).
// --------------------------------------------------------------------------
function brandFromDomain(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (!s) return "";
  const root = s.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

export async function runAiVisibilityAction(args: {
  /** Preferred: brand or keyword to track. */
  keyword?: string;
  /** Legacy: domain — we'll derive a brand from it. */
  domain?: string;
  country?: string;
}): Promise<CachedToolResult<AiVisibilityResult>> {
  const { workspace } = await requireWorkspace();
  const keyword = (args.keyword ?? brandFromDomain(args.domain ?? "")).trim();
  if (!keyword) {
    return { ok: false, error: "Enter a brand name or keyword." };
  }
  const res = await runAiVisibility({
    workspaceId: workspace.id,
    keyword,
    country: args.country,
  });
  if ("ok" in res && res.ok && !("pending" in res)) revalidatePath("/agents/geo");
  return res;
}

// --------------------------------------------------------------------------
// 2) AI Metrics — Apify keyword metrics (async)
// --------------------------------------------------------------------------
export async function runAiMetricsAction(args: {
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordMetricsResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runKeywordMetrics({ workspaceId: workspace.id, ...args });
  if ("ok" in res && res.ok && !("pending" in res)) revalidatePath("/agents/geo");
  return res;
}

// --------------------------------------------------------------------------
// 3) AI Overview — Apify SERP (async)
// --------------------------------------------------------------------------
export async function runAiOverviewAction(args: {
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<SerpOverviewResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runSerpOverview({ workspaceId: workspace.id, ...args });
  if ("ok" in res && res.ok && !("pending" in res)) revalidatePath("/agents/geo");
  return res;
}

// --------------------------------------------------------------------------
// 4) Top AI-cited Sites — Apify (async)
// --------------------------------------------------------------------------
export async function runTopAiCitedAction(args: {
  country?: string;
  category?: string | null;
}): Promise<CachedToolResult<TopWebsitesResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runTopWebsites({ workspaceId: workspace.id, ...args });
  if ("ok" in res && res.ok && !("pending" in res)) revalidatePath("/agents/geo");
  return res;
}

// --------------------------------------------------------------------------
// 5) AI Citation Check — LLM-driven (synchronous, finishes in <30s)
// --------------------------------------------------------------------------
const citationProbeSchema = z.object({
  cited: z.boolean(),
  mentioned: z.boolean(),
  summary: z.string(),
  competitors: z.array(z.string()).max(8),
});

export type AiCitationCheckResult = {
  domain: string;
  query: string;
  byProvider: Array<{
    provider: string;
    cited: boolean;
    mentioned: boolean;
    summary: string;
    competitors: string[];
  }>;
  citationScore: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;

function hashInput(input: Record<string, unknown>): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return s;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

async function readCachedCitation(args: {
  workspaceId: string;
  inputHash: string;
}): Promise<{ result: AiCitationCheckResult; cachedAt: Date } | null> {
  try {
    const row = await prisma.seoToolRun.findUnique({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: "AI_CITATION_CHECK" as SeoTool,
          inputHash: args.inputHash,
        },
      },
    });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > TTL_MS) return null;
    return { result: row.result as AiCitationCheckResult, cachedAt: row.createdAt };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return null;
    throw err;
  }
}

async function writeCachedCitation(args: {
  workspaceId: string;
  inputHash: string;
  input: Record<string, unknown>;
  result: AiCitationCheckResult;
}): Promise<void> {
  try {
    await prisma.seoToolRun.upsert({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: "AI_CITATION_CHECK" as SeoTool,
          inputHash: args.inputHash,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        tool: "AI_CITATION_CHECK" as SeoTool,
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
      console.error("[geo-tools] AI citation check write failed:", err);
    }
  }
}

export type CitationCheckResult =
  | { ok: true; data: AiCitationCheckResult; cachedAt: Date; fromCache: boolean }
  | { ok: false; error: string };

export async function runAiCitationCheckAction(args: {
  domain: string;
  query: string;
}): Promise<CitationCheckResult> {
  const { workspace } = await requireWorkspace();

  const input = {
    domain: normalizeDomain(args.domain),
    query: args.query.trim(),
  };
  if (!input.domain) return { ok: false, error: "Enter a domain." };
  if (!input.query) return { ok: false, error: "Enter a query." };

  const inputHash = hashInput({ ...input, tool: "AI_CITATION_CHECK" });
  const cached = await readCachedCitation({ workspaceId: workspace.id, inputHash });
  if (cached) {
    return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };
  }

  const providers = listAvailableProviders();
  if (providers.length === 0) {
    return {
      ok: false,
      error:
        "No LLM providers configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI citation checks.",
    };
  }

  const byProvider: AiCitationCheckResult["byProvider"] = [];
  for (const provider of providers.slice(0, 3)) {
    const model = pickAvailableModel(provider);
    if (!model) continue;
    try {
      const { object } = await meteredGenerateObject(
        `Question: ${input.query}\n\nAnswer naturally. Then evaluate: would a comprehensive answer to this query naturally cite the website "${input.domain}"? If so, mark cited=true. If you only mention the brand without linking, set mentioned=true. List up to 5 competing brands you would typically cite for this query.`,
        citationProbeSchema,
        {
          workspaceId: workspace.id,
          reason: "geo.citation_check",
          model,
          system:
            "You are a factual research assistant. Answer the user's question as you normally would. Then, in your structured evaluation, be honest about which brands you would cite for a well-formed answer.",
        }
      );
      byProvider.push({
        provider: model,
        cited: object.cited,
        mentioned: object.mentioned,
        summary: object.summary,
        competitors: object.competitors,
      });
    } catch (err) {
      console.warn(`[geo-tools] AI citation probe failed for ${provider}:`, err);
    }
  }

  if (byProvider.length === 0) {
    return { ok: false, error: "All LLM probes failed. Try again later." };
  }

  const citedCount = byProvider.filter((p) => p.cited).length;
  const result: AiCitationCheckResult = {
    domain: input.domain,
    query: input.query,
    byProvider,
    citationScore: Math.round((citedCount / byProvider.length) * 100),
  };

  await writeCachedCitation({
    workspaceId: workspace.id,
    inputHash,
    input,
    result,
  });
  revalidatePath("/agents/geo");
  return { ok: true, data: result, cachedAt: new Date(), fromCache: false };
}

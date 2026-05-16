import { z } from "zod";
import type { PageSnapshot } from "@/backend/scraper/fetch";
import {
  CMO_PREFERRED_MODEL,
  meteredGenerateObject,
  pickAvailableModel,
} from "@/backend/llm";
import { normalizeUrl } from "@/backend/scraper/fetch";

/**
 * Single-call structured analysis for /agent/cmo when only an LLM + homepage scrape
 * are available (no PageSpeed, GA4, or GSC). Scores are heuristic — not Lighthouse.
 */
export const cmoLlmAnalysisSchema = z.object({
  heuristicLighthouse: z.object({
    performance: z.number().int().min(0).max(100),
    accessibility: z.number().int().min(0).max(100),
    bestPractices: z.number().int().min(0).max(100),
    seo: z.number().int().min(0).max(100),
    rationale: z.string().max(600),
  }),
  metaRecommendations: z.object({
    titleVerdict: z.enum(["good", "weak", "missing"]),
    titleSuggestion: z.string().optional(),
    descriptionVerdict: z.enum(["good", "weak", "missing"]),
    descriptionSuggestion: z.string().optional(),
    canonicalAdvice: z.string().max(500),
  }),
  contentQuality: z.object({
    summary: z.string().max(900),
    strengths: z.array(z.string()).max(6),
    gaps: z.array(z.string()).max(6),
  }),
  suggestedQueriesToTrack: z.array(
    z.object({
      query: z.string(),
      intent: z.enum([
        "informational",
        "commercial",
        "transactional",
        "navigational",
      ]),
      note: z.string().max(200),
    })
  ).max(14),
  illustrativeTraffic: z.object({
    sessionsQualifier: z.string().max(200),
    note: z.string().max(400),
  }),
  technicalPriorities: z.array(z.string()).max(8),
  aiVisibility: z.object({
    summary: z.string().max(700),
    suggestedActions: z.array(z.string()).max(5),
  }),
  socialListeningHook: z.string().max(500),
  documentEnrichment: z.object({
    productBlurb: z.string().max(600),
    competitorAngles: z.string().max(600),
    voiceSummary: z.string().max(500),
    strategySummary: z.string().max(600),
  }),
});

export type CmoLlmAnalysis = z.infer<typeof cmoLlmAnalysisSchema>;

export type CmoLlmSnapshotStored = {
  v: 1;
  url: string;
  generatedAt: string;
} & CmoLlmAnalysis;

const SYSTEM = `You are a senior technical SEO and growth analyst. You are given structured data from a single fetched HTML page (homepage). 

Rules:
- Produce heuristic 0-100 scores for performance/a11y/best-practices/SEO categories as *estimates* based only on signals in the snapshot (content depth, headings, images, links, meta language). These are NOT real Lighthouse runs — state that in rationale.
- Never fabricate real traffic, rankings, or conversion numbers. For traffic, use qualitative bands and tell the user to connect GA4.
- suggestedQueriesToTrack: realistic Google-style queries the brand might care about; do not claim they appear in Search Console.
- Be specific: cite what you observed from title, headings, and body excerpt.`;

function buildPrompt(args: {
  websiteUrl: string;
  industry: string | null;
  icp: string | null;
  snap: PageSnapshot;
}): string {
  const excerpt = args.snap.text.slice(0, 8_000);
  return [
    `URL: ${args.websiteUrl}`,
    `HTTP status: ${args.snap.status}`,
    args.industry ? `Workspace industry (hint): ${args.industry}` : null,
    args.icp ? `Workspace ICP (hint): ${args.icp}` : null,
    `Title (${args.snap.title.length} chars): ${args.snap.title}`,
    `Meta description (${args.snap.description.length} chars): ${args.snap.description || "(empty)"}`,
    `Language: ${args.snap.lang ?? "unknown"}`,
    `H1 (${args.snap.h1.length}): ${args.snap.h1.join(" | ") || "(none)"}`,
    `H2 sample: ${args.snap.h2.slice(0, 12).join(" | ") || "(none)"}`,
    `Word count: ${args.snap.wordCount}`,
    `Images: ${args.snap.images.length}, missing alt: ${args.snap.images.filter((i) => !i.alt).length}`,
    `Internal links: ${args.snap.links.filter((l) => l.internal).length}, external: ${args.snap.links.filter((l) => !l.internal).length}`,
    `JSON-LD blocks: ${args.snap.jsonLd.length}`,
    "",
    "Body excerpt:",
    excerpt,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCmoLlmAnalysis(input: {
  workspaceId: string;
  websiteUrl: string;
  industry: string | null;
  icp: string | null;
  snapshot: PageSnapshot;
}): Promise<CmoLlmAnalysis | null> {
  const model = pickAvailableModel(CMO_PREFERRED_MODEL);
  if (!model) return null;

  const prompt = buildPrompt({
    websiteUrl: input.websiteUrl,
    industry: input.industry,
    icp: input.icp,
    snap: input.snapshot,
  });

  try {
    const { object } = await meteredGenerateObject(prompt, cmoLlmAnalysisSchema, {
      workspaceId: input.workspaceId,
      reason: "cmo.llm_analysis",
      model,
      system: SYSTEM,
    });
    return object;
  } catch (err) {
    console.error("[cmo] meteredGenerateObject failed:", err);
    return null;
  }
}

export function normalizeWebsiteUrlForCache(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url.trim();
  }
}

export function parseCmoLlmSnapshot(
  raw: unknown,
  expectedUrl: string | null,
  maxAgeMs: number
): CmoLlmAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.url !== "string" || typeof o.generatedAt !== "string") {
    return null;
  }
  if (!expectedUrl) return null;
  if (normalizeWebsiteUrlForCache(o.url) !== normalizeWebsiteUrlForCache(expectedUrl)) {
    return null;
  }
  const age = Date.now() - new Date(o.generatedAt).getTime();
  if (!Number.isFinite(age) || age > maxAgeMs) return null;

  const { v: _v, url: _u, generatedAt: _g, ...rest } = o;
  const parsed = cmoLlmAnalysisSchema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}

export function toStoredSnapshot(
  url: string,
  analysis: CmoLlmAnalysis
): CmoLlmSnapshotStored {
  return {
    v: 1,
    url: normalizeWebsiteUrlForCache(url),
    generatedAt: new Date().toISOString(),
    ...analysis,
  };
}

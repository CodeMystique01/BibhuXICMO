import type { AgentContext } from "./base";

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

/** Minimum relevance (0–1) to show under Discovered. */
export const MIN_DISCOVERED_RELEVANCE = 0.4;

/** Minimum relevance (0–1) to draft a comment. */
export const MIN_COMMENT_RELEVANCE = 0.65;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "our",
  "your",
  "www",
  "com",
  "inc",
  "llc",
]);

function normalizeKeyword(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  if (k.length < 2 || k.length > 40) return null;
  if (STOPWORDS.has(k)) return null;
  return k;
}

function brandFromWebsiteUrl(url: string | null): string[] {
  if (!url?.trim()) return [];
  try {
    const href = url.includes("://") ? url : `https://${url}`;
    const host = new URL(href).hostname.replace(/^www\./i, "");
    const parts = host.split(".").filter(Boolean);
    const brand = parts[0];
    if (!brand || brand.length < 2) return [];
    const n = normalizeKeyword(brand);
    return n ? [n] : [];
  } catch {
    return [];
  }
}

/** Pull short tokens from free-text ICP / positioning for Algolia search. */
function tokensFromText(text: string, max = 4): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, max);
}

/**
 * Keywords for HN Algolia search — derived from website brand, industry, voice, ICP.
 * Does not use front-page stories (too generic).
 */
export function deriveHNKeywords(
  ctx: AgentContext,
  inputKeywords: string[] | undefined,
  voice: VoiceProfile | null
): string[] {
  const seen = new Set<string>();
  const add = (raw: string) => {
    const k = normalizeKeyword(raw);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };

  const out: string[] = [];

  for (const k of inputKeywords ?? []) add(k);
  for (const k of brandFromWebsiteUrl(ctx.websiteUrl)) add(k);
  if (ctx.industry) add(ctx.industry);
  for (const k of voice?.topicClusters?.flatMap((c) => c.keywords) ?? []) add(k);
  for (const k of tokensFromText(voice?.positioning ?? "")) add(k);
  if (ctx.icp) for (const k of tokensFromText(ctx.icp, 3)) add(k);

  return out.slice(0, 6);
}

export function formatBrandContext(ctx: AgentContext, voice: VoiceProfile | null): string {
  const keywords = deriveHNKeywords(ctx, undefined, voice);
  return [
    `Website: ${ctx.websiteUrl || "unknown"}`,
    `Industry: ${ctx.industry || "unknown"}`,
    `ICP: ${ctx.icp || "unknown"}`,
    `Positioning: ${voice?.positioning || "unknown"}`,
    `Search keywords: ${keywords.length ? keywords.join(", ") : "none"}`,
  ].join("\n");
}

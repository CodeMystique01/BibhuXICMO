/**
 * Instagram-tuned keyword helpers. Reuses the shared brand/voice keyword
 * derivation from `hn-keywords.ts` but adds an IG-specific hashtag generator
 * and a slightly larger stopword list (IG captions are noisier than HN).
 */
import type { AgentContext } from "./base";
import { deriveHNKeywords, formatBrandContext } from "./hn-keywords";

export const MIN_IG_DISCOVERED_RELEVANCE = 0.4;
export const MIN_IG_REPLY_RELEVANCE = 0.65;
export const MIN_IG_CREATOR_FIT = 0.6;

const IG_STOP = new Set([
  "love",
  "instagood",
  "follow",
  "photooftheday",
  "fashion",
  "beautiful",
  "happy",
  "cute",
  "tbt",
  "like4like",
  "summer",
  "art",
  "instalike",
  "smile",
  "vsco",
]);

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

/** Brand keywords filtered against the IG stop list. */
export function deriveIGKeywords(
  ctx: AgentContext,
  inputKeywords: string[] | undefined,
  voice: VoiceProfile | null
): string[] {
  return deriveHNKeywords(ctx, inputKeywords, voice).filter(
    (k) => !IG_STOP.has(k)
  );
}

/**
 * Suggest hashtags from the brand keywords, prefixed with `#` and
 * de-duplicated. Caller will typically slice to top 5–8.
 */
export function suggestIGHashtags(
  ctx: AgentContext,
  voice: VoiceProfile | null
): string[] {
  const out = new Set<string>();
  for (const k of deriveIGKeywords(ctx, undefined, voice)) {
    const cleaned = k.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    if (cleaned.length >= 3) out.add(cleaned);
  }
  if (ctx.industry) {
    for (const part of ctx.industry.toLowerCase().split(/\s+/)) {
      const c = part.replace(/[^\p{L}\p{N}_]/gu, "");
      if (c.length >= 3) out.add(c);
    }
  }
  return [...out].slice(0, 10);
}

export { formatBrandContext };

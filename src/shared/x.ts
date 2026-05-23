/** X / Twitter draft metadata stored on ContentDraft.meta */

export type XKind = "single" | "thread" | "reply";

export type XDraftMeta = {
  xKind: XKind;
  mode?: "single" | "thread";
  tweets?: string[];
  hashtags?: string[];
  /** Reply target — set when xKind === "reply" */
  parentTweetId?: string;
  parentAuthor?: string;
  parentUrl?: string;
  parentText?: string;
  /** Original site that produced this draft (used to clear stale posts after site change) */
  sourceWebsiteUrl?: string;
  /** Why the LLM thought this was worth drafting */
  reasoning?: string;
};

export function parseXMeta(meta: unknown): XDraftMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const explicit = m.xKind;
  let xKind: XKind | null = null;
  if (explicit === "single" || explicit === "thread" || explicit === "reply") {
    xKind = explicit;
  } else if (m.parentTweetId) {
    xKind = "reply";
  } else if (m.mode === "thread") {
    xKind = "thread";
  } else if (m.mode === "single") {
    xKind = "single";
  } else if (Array.isArray(m.tweets) && (m.tweets as unknown[]).length > 1) {
    xKind = "thread";
  } else if (typeof m.tweets !== "undefined") {
    xKind = "single";
  }
  if (!xKind) return null;

  return {
    xKind,
    mode: m.mode === "thread" ? "thread" : m.mode === "single" ? "single" : undefined,
    tweets: Array.isArray(m.tweets) ? (m.tweets as string[]) : undefined,
    hashtags: Array.isArray(m.hashtags) ? (m.hashtags as string[]) : undefined,
    parentTweetId: typeof m.parentTweetId === "string" ? m.parentTweetId : undefined,
    parentAuthor: typeof m.parentAuthor === "string" ? m.parentAuthor : undefined,
    parentUrl: typeof m.parentUrl === "string" ? m.parentUrl : undefined,
    parentText: typeof m.parentText === "string" ? m.parentText : undefined,
    sourceWebsiteUrl:
      typeof m.sourceWebsiteUrl === "string" ? m.sourceWebsiteUrl : undefined,
    reasoning: typeof m.reasoning === "string" ? m.reasoning : undefined,
  };
}

export function xKindLabel(kind: XKind): string {
  switch (kind) {
    case "single":
      return "Tweet";
    case "thread":
      return "Thread";
    case "reply":
      return "Reply";
  }
}

export function buildXClipboard(meta: XDraftMeta, body: string): string {
  if (meta.xKind === "thread" && meta.tweets?.length) {
    return meta.tweets
      .map((t, i) => `${i + 1}/${meta.tweets!.length} ${t}`)
      .join("\n\n");
  }
  return meta.tweets?.[0] ?? body;
}

/** Append hashtags to a tweet if there is room under 280 chars. */
export function appendHashtags(text: string, hashtags?: string[]): string {
  if (!hashtags?.length) return text;
  const tagStr = hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const candidate = `${text}\n\n${tagStr}`;
  if (candidate.length <= 280) return candidate;
  return text;
}

/** Next ~9:00 AM US Eastern (13:00 UTC) — peak X traffic window. */
export function nextXPeakUtc(): Date {
  const now = new Date();
  const peak = new Date(now);
  peak.setUTCHours(13, 0, 0, 0);
  if (peak <= now) {
    peak.setUTCDate(peak.getUTCDate() + 1);
  }
  return peak;
}

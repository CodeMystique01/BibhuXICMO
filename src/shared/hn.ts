/** Hacker News draft metadata stored on ContentDraft.meta */

export type HNKind = "comment" | "show_hn" | "ask_hn";

export type HNDraftMeta = {
  hnKind: HNKind;
  submitUrl?: string;
  storyId?: string;
  itemUrl?: string;
  postUrl?: string;
  reasoning?: string;
  peakWindow?: "morning_pt";
};

export const HN_SUBMIT_URL = "https://news.ycombinator.com/submit";

export function hnItemUrl(storyId: string) {
  return `https://news.ycombinator.com/item?id=${storyId}`;
}

/** Next ~10:00 AM US Pacific (18:00 UTC, standard-time approximation). */
export function nextHNPeakUtc(): Date {
  const now = new Date();
  const peak = new Date(now);
  peak.setUTCHours(18, 0, 0, 0);
  if (peak <= now) {
    peak.setUTCDate(peak.getUTCDate() + 1);
  }
  return peak;
}

export function parseHnMeta(meta: unknown): HNDraftMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const kind = m.hnKind;
  if (kind !== "comment" && kind !== "show_hn" && kind !== "ask_hn") return null;
  return {
    hnKind: kind,
    submitUrl: typeof m.submitUrl === "string" ? m.submitUrl : undefined,
    storyId: typeof m.storyId === "string" ? m.storyId : undefined,
    itemUrl: typeof m.itemUrl === "string" ? m.itemUrl : undefined,
    postUrl: typeof m.postUrl === "string" ? m.postUrl : undefined,
    reasoning: typeof m.reasoning === "string" ? m.reasoning : undefined,
    peakWindow: m.peakWindow === "morning_pt" ? "morning_pt" : undefined,
  };
}

export function hnKindLabel(kind: HNKind): string {
  switch (kind) {
    case "show_hn":
      return "Show HN";
    case "ask_hn":
      return "Ask HN";
    case "comment":
      return "Comment";
  }
}

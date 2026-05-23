/** Instagram draft metadata stored on ContentDraft.meta */

export type IGKind =
  | "post"
  | "reel"
  | "story"
  | "comment_reply"
  | "dm_outreach"
  | "dm_negotiation";

export type IGDraftMeta = {
  igKind: IGKind;
  /** Suggested caption hashtags (separate from inline body). */
  hashtags?: string[];
  /** Optional image / video prompt for the user to generate visuals with. */
  visualPrompt?: string;
  /** Imagine URL the user has attached for auto-publish. */
  mediaUrl?: string;
  /** For comment_reply — the IG comment id and the parent media id. */
  commentId?: string;
  mediaId?: string;
  /** For DM drafts — recipient handle, campaign + negotiation ids. */
  recipient?: string;
  campaignId?: string;
  negotiationId?: string;
  /** Free-text rationale from the LLM. */
  reasoning?: string;
  /** Site-tag for invalidating stale drafts when website changes. */
  sourceWebsiteUrl?: string;
};

export function parseIgMeta(meta: unknown): IGDraftMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const k = m.igKind;
  if (
    k !== "post" &&
    k !== "reel" &&
    k !== "story" &&
    k !== "comment_reply" &&
    k !== "dm_outreach" &&
    k !== "dm_negotiation"
  ) {
    return null;
  }
  return {
    igKind: k,
    hashtags: Array.isArray(m.hashtags) ? (m.hashtags as string[]) : undefined,
    visualPrompt: typeof m.visualPrompt === "string" ? m.visualPrompt : undefined,
    mediaUrl: typeof m.mediaUrl === "string" ? m.mediaUrl : undefined,
    commentId: typeof m.commentId === "string" ? m.commentId : undefined,
    mediaId: typeof m.mediaId === "string" ? m.mediaId : undefined,
    recipient: typeof m.recipient === "string" ? m.recipient : undefined,
    campaignId: typeof m.campaignId === "string" ? m.campaignId : undefined,
    negotiationId:
      typeof m.negotiationId === "string" ? m.negotiationId : undefined,
    reasoning: typeof m.reasoning === "string" ? m.reasoning : undefined,
    sourceWebsiteUrl:
      typeof m.sourceWebsiteUrl === "string" ? m.sourceWebsiteUrl : undefined,
  };
}

export function igKindLabel(kind: IGKind): string {
  switch (kind) {
    case "post":
      return "Feed Post";
    case "reel":
      return "Reel";
    case "story":
      return "Story";
    case "comment_reply":
      return "Comment Reply";
    case "dm_outreach":
      return "Outreach DM";
    case "dm_negotiation":
      return "Negotiation DM";
  }
}

export function isIGContentKind(kind: IGKind): boolean {
  return kind === "post" || kind === "reel" || kind === "story";
}

export function buildIGClipboard(meta: IGDraftMeta, body: string): string {
  const hashtagLine =
    meta.hashtags && meta.hashtags.length
      ? "\n\n" +
        meta.hashtags
          .map((h) => (h.startsWith("#") ? h : `#${h}`))
          .join(" ")
      : "";
  return `${body}${hashtagLine}`;
}

/** Next ~11:00 AM ET (15:00 UTC) — generally accepted IG engagement peak. */
export function nextIGPeakUtc(): Date {
  const now = new Date();
  const peak = new Date(now);
  peak.setUTCHours(15, 0, 0, 0);
  if (peak <= now) {
    peak.setUTCDate(peak.getUTCDate() + 1);
  }
  return peak;
}

/**
 * Apify-backed Instagram READS (no IG OAuth required).
 *
 * Used by the Instagram agent for content discovery and influencer
 * research. Posting / replying still go through the Graph API
 * (`./instagram.ts`) or the DM automation actor (`./instagram-apify-dm.ts`).
 *
 * Config:
 *   APIFY_TOKEN                    — required (or APIFY_IG_TOKEN, preferred if set)
 *   APIFY_IG_ACTOR_ID              — default "apify~instagram-scraper"
 *   APIFY_IG_HASHTAG_ACTOR_ID      — default "apify~instagram-hashtag-scraper"
 *
 * The scraper actors return shapes that vary slightly between versions;
 * we normalize to stable `IGScrapedPost` and `IGScrapedProfile` types.
 */
import { env } from "@/shared/env";

export type IGScrapedPost = {
  id: string; // shortcode or rest_id
  shortcode: string;
  caption: string;
  ownerHandle: string;
  ownerFollowers?: number;
  url: string;
  mediaUrl?: string;
  likes: number;
  comments: number;
  timestamp?: string;
  hashtags: string[];
  isVideo?: boolean;
};

export type IGScrapedProfile = {
  handle: string;
  fullName?: string;
  bio?: string;
  followers: number;
  following?: number;
  posts?: number;
  isBusiness?: boolean;
  isVerified?: boolean;
  profileUrl: string;
  externalUrl?: string;
  engagementRate?: number;
};

export class ApifyIGNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN (or APIFY_IG_TOKEN) is not configured");
    this.name = "ApifyIGNotConfiguredError";
  }
}

export class ApifyIGError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyIGError";
  }
}

const SYNC_TIMEOUT_MS = 90_000;

function apifyToken(): string {
  const token = env.APIFY_IG_TOKEN || env.APIFY_TOKEN;
  if (!token) throw new ApifyIGNotConfiguredError();
  return token;
}

async function runActor<T>(
  actor: string,
  input: Record<string, unknown>,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T[]> {
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken())}`;

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyIGError(
      `Apify IG actor ${actor} returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status
    );
  }
  const items = await res.json();
  return Array.isArray(items) ? (items as T[]) : [];
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function pickNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[, _]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.add(m[1].toLowerCase());
  }
  return [...out].slice(0, 12);
}

function normalizePost(item: unknown): IGScrapedPost | null {
  const o = asObject(item);
  if (!o) return null;

  const shortcode =
    pickString(o, ["shortCode", "shortcode", "code"]) ??
    pickString(o, ["id"]);
  if (!shortcode) return null;

  const caption = pickString(o, ["caption", "text", "description"]) ?? "";
  const ownerO = asObject(o.owner) ?? asObject(o.user) ?? {};
  const handle =
    pickString(o, ["ownerUsername", "username"]) ??
    pickString(ownerO, ["username", "userName", "handle"]) ??
    "unknown";

  const url =
    pickString(o, ["url", "permalink"]) ??
    `https://www.instagram.com/p/${shortcode}/`;

  return {
    id: shortcode,
    shortcode,
    caption,
    ownerHandle: handle,
    ownerFollowers: pickNumber(ownerO, ["followers", "followersCount"]),
    url,
    mediaUrl: pickString(o, ["displayUrl", "imageUrl", "thumbnailUrl", "videoUrl"]),
    likes: pickNumber(o, ["likesCount", "likes", "edge_liked_by"]) ?? 0,
    comments: pickNumber(o, ["commentsCount", "comments"]) ?? 0,
    timestamp: pickString(o, ["timestamp", "takenAtTimestamp", "createdAt"]),
    hashtags: extractHashtags(caption),
    isVideo:
      o.isVideo === true ||
      pickString(o, ["mediaType", "type"]) === "Video" ||
      undefined,
  };
}

function normalizeProfile(item: unknown): IGScrapedProfile | null {
  const o = asObject(item);
  if (!o) return null;

  const handle = pickString(o, ["username", "userName", "handle"]);
  if (!handle) return null;

  const followers = pickNumber(o, [
    "followersCount",
    "followers",
    "follower_count",
  ]) ?? 0;

  return {
    handle,
    fullName: pickString(o, ["fullName", "name"]),
    bio: pickString(o, ["biography", "bio", "description"]),
    followers,
    following: pickNumber(o, ["followsCount", "following", "followingCount"]),
    posts: pickNumber(o, ["postsCount", "mediaCount", "posts"]),
    isBusiness: o.isBusinessAccount === true || o.isBusiness === true,
    isVerified: o.verified === true || o.isVerified === true,
    profileUrl:
      pickString(o, ["profileUrl", "url"]) ??
      `https://www.instagram.com/${handle}/`,
    externalUrl: pickString(o, ["externalUrl", "website"]),
    engagementRate: pickNumber(o, ["engagementRate", "engagement_rate"]),
  };
}

export type IGHashtagSearchOptions = {
  resultsLimit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apifyScrapeHashtag(
  hashtag: string,
  opts: IGHashtagSearchOptions = {}
): Promise<IGScrapedPost[]> {
  const tag = hashtag.replace(/^#+/, "").trim();
  if (!tag) return [];

  const items = await runActor<unknown>(
    env.APIFY_IG_HASHTAG_ACTOR_ID,
    {
      hashtags: [tag],
      resultsLimit: Math.min(opts.resultsLimit ?? 20, 50),
      addParentData: false,
    },
    opts
  );
  const out: IGScrapedPost[] = [];
  for (const item of items) {
    const p = normalizePost(item);
    if (p) out.push(p);
  }
  return out;
}

export type IGProfileSearchOptions = {
  resultsLimit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apifyScrapeProfiles(
  handles: string[],
  opts: IGProfileSearchOptions = {}
): Promise<IGScrapedProfile[]> {
  if (handles.length === 0) return [];

  const items = await runActor<unknown>(
    env.APIFY_IG_ACTOR_ID,
    {
      usernames: handles.map((h) => h.replace(/^@/, "")),
      resultsType: "details",
      resultsLimit: Math.min(opts.resultsLimit ?? handles.length, 50),
    },
    opts
  );
  const out: IGScrapedProfile[] = [];
  for (const item of items) {
    const p = normalizeProfile(item);
    if (p) out.push(p);
  }
  return out;
}

export async function apifyScrapeProfilePosts(
  handle: string,
  opts: { resultsLimit?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<IGScrapedPost[]> {
  const items = await runActor<unknown>(
    env.APIFY_IG_ACTOR_ID,
    {
      usernames: [handle.replace(/^@/, "")],
      resultsType: "posts",
      resultsLimit: Math.min(opts.resultsLimit ?? 20, 50),
    },
    opts
  );
  const out: IGScrapedPost[] = [];
  for (const item of items) {
    const p = normalizePost(item);
    if (p) out.push(p);
  }
  return out;
}

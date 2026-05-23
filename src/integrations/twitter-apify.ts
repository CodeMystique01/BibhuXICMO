/**
 * Apify-backed Twitter / X scraper.
 *
 * Used by the X agent for READS (search timeline, find tweets to reply to).
 * Reuses the same `APIFY_TOKEN` env that powers the Ahrefs panel.
 * Posting still uses the OAuth integration in `./twitter.ts` (free tier).
 *
 * Config:
 *   APIFY_TOKEN         — required
 *   APIFY_X_ACTOR_ID    — default "apidojo~tweet-scraper"
 *
 * The default actor accepts: `searchTerms[]`, `maxItems`, `sort`,
 * `tweetLanguage`, `sinceDate`, `untilDate`. We normalize whatever it
 * returns into a stable `ApifyTweet` shape so the agent doesn't care
 * about per-actor field naming.
 */
import { env } from "@/shared/env";

export type ApifyTweet = {
  id: string;
  text: string;
  url: string;
  author: {
    username: string;
    name?: string;
    followers?: number;
    verified?: boolean;
  };
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes?: number;
  };
  createdAt: string;
  lang?: string;
};

export class ApifyXNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN is not configured");
    this.name = "ApifyXNotConfiguredError";
  }
}

export class ApifyXError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyXError";
  }
}

const SYNC_TIMEOUT_MS = 60_000;

export type ApifySearchOptions = {
  maxItems?: number;
  sort?: "Top" | "Latest";
  sinceDays?: number;
  lang?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apifySearchTweets(
  query: string,
  opts: ApifySearchOptions = {}
): Promise<ApifyTweet[]> {
  if (!env.APIFY_TOKEN) throw new ApifyXNotConfiguredError();
  if (!query.trim()) return [];

  const actor = env.APIFY_X_ACTOR_ID;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(env.APIFY_TOKEN)}`;

  const sinceDate = opts.sinceDays
    ? new Date(Date.now() - opts.sinceDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : undefined;

  const payload = {
    searchTerms: [query],
    maxItems: Math.min(opts.maxItems ?? 20, 50),
    sort: opts.sort ?? "Top",
    tweetLanguage: opts.lang ?? "en",
    onlyVerifiedUsers: false,
    onlyTwitterBlue: false,
    ...(sinceDate ? { sinceDate } : {}),
  };

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
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
    throw new ApifyXError(
      `Apify X actor returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new ApifyXError(
      `Failed to parse Apify response as JSON: ${(err as Error).message}`
    );
  }

  if (!Array.isArray(raw)) return [];

  const tweets: ApifyTweet[] = [];
  for (const item of raw) {
    const t = normalizeTweet(item);
    if (t) tweets.push(t);
  }
  return tweets;
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

/** Normalize whatever the actor returned into our stable shape. */
function normalizeTweet(item: unknown): ApifyTweet | null {
  const o = asObject(item);
  if (!o) return null;

  const id = pickString(o, ["id", "id_str", "tweetId", "rest_id"]);
  const text = pickString(o, ["text", "fullText", "full_text", "tweetText"]);
  if (!id || !text) return null;

  const author = asObject(o.author) ?? asObject(o.user) ?? {};
  const username =
    pickString(author, ["userName", "username", "screen_name", "handle"]) ??
    pickString(o, ["userName", "username", "screen_name"]) ??
    "unknown";
  const displayName =
    pickString(author, ["name", "displayName", "fullName"]) ?? undefined;
  const followers = pickNumber(author, [
    "followers",
    "followersCount",
    "followers_count",
  ]);
  const verified =
    author.isVerified === true ||
    author.verified === true ||
    author.isBlueVerified === true ||
    undefined;

  const url =
    pickString(o, ["url", "tweetUrl", "permanentUrl"]) ??
    `https://x.com/${username}/status/${id}`;

  const createdAt =
    pickString(o, ["createdAt", "created_at", "date"]) ?? new Date().toISOString();
  const lang = pickString(o, ["lang", "language"]);

  return {
    id,
    text,
    url,
    author: { username, name: displayName, followers, verified },
    metrics: {
      likes: pickNumber(o, ["likeCount", "likes", "favorite_count", "favoriteCount"]) ?? 0,
      retweets:
        pickNumber(o, ["retweetCount", "retweets", "retweet_count"]) ?? 0,
      replies: pickNumber(o, ["replyCount", "replies", "reply_count"]) ?? 0,
      quotes: pickNumber(o, ["quoteCount", "quotes", "quote_count"]),
    },
    createdAt,
    lang,
  };
}

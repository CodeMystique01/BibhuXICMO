/**
 * YouTube Data API v3 integration for the /agents/youtube creator search.
 *
 * Mirrors the QuickAds `scraper.py` approach:
 *
 *   1. POST /youtube/v3/search?type=channel&q=<keyword> → channel ids
 *   2. POST /youtube/v3/channels?id=<ids>&part=snippet,statistics
 *      → full channel metadata (title, description, country, subs,
 *        views, videos, thumbnails)
 *   3. Apply smart-creator heuristic to filter out brand / corporate
 *      channels.
 *
 * Quota cost per search keyword:
 *   - search.list = 100 units
 *   - channels.list (batched up to 50 ids) = 1 unit
 *
 * Free tier = 10 000 units/day → ≈99 single-keyword searches with full
 * channel enrichment. The UI lets you pass up to 8 keywords per search
 * (~808 units), so plan accordingly.
 */
import { env } from "@/shared/env";

const SEARCH_TIMEOUT_MS = 25_000;
const DETAILS_TIMEOUT_MS = 25_000;

export class YTApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "YTApiError";
  }
}

export class YTApiNotConfiguredError extends Error {
  constructor() {
    super("YOUTUBE_API_KEY is not configured");
    this.name = "YTApiNotConfiguredError";
  }
}

function ytKey(): string {
  if (!env.YOUTUBE_API_KEY) throw new YTApiNotConfiguredError();
  return env.YOUTUBE_API_KEY;
}

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------
export type YTDiscoveryInput = {
  keywords: string[];
  /** ISO 3166-1 alpha-2, e.g. "US" / "IN". */
  country?: string;
  /** BCP-47 language code, e.g. "en" / "hi". */
  language?: string;
  /** Min subscriber filter (post-fetch). 0 = no minimum. */
  minSubscribers?: number;
  /** Max subscriber filter (post-fetch). 0 = no max. */
  maxSubscribers?: number;
  /** Hard cap on returned channels (10-200). */
  maxChannels?: number;
  /** When true (default), excludes brand / corporate channels. */
  creatorsOnly?: boolean;
};

export type YTCreatorRow = {
  channelId: string;
  handle: string | null;
  title: string;
  description: string;
  subscribers: number;
  videoCount: number | null;
  /** Aggregate lifetime view count — bigint as string for safe JSON transport. */
  viewCount: string | null;
  country: string | null;
  language: string | null;
  category: string | null;
  email: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  channelUrl: string;
  customUrl: string | null;
  isVerified: boolean;
  isCreator: boolean;
  detectionNote: string;
  qualityScore: number; // 0-100
};

// --------------------------------------------------------------------------
// Discovery entry point — runs synchronously (YT Data API is fast).
// --------------------------------------------------------------------------
export async function searchYTCreators(
  input: YTDiscoveryInput
): Promise<YTCreatorRow[]> {
  const key = ytKey();
  const keywords = input.keywords
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, 8);
  if (keywords.length === 0) {
    throw new YTApiError("At least one search keyword is required.");
  }
  const cap = Math.min(Math.max(input.maxChannels ?? 50, 10), 200);
  // Per-keyword channel budget: spread evenly across keywords, but ask for at
  // least 25 to give the heuristic enough headroom to filter brands out.
  const perKeyword = Math.max(25, Math.ceil((cap * 1.6) / keywords.length));

  // ---- Step 1: search.list per keyword → unique channel ids ----
  const ids = new Set<string>();
  for (const kw of keywords) {
    try {
      const more = await searchChannelIds(key, kw, perKeyword, input);
      for (const id of more) ids.add(id);
    } catch (err) {
      // If we hit quotaExceeded on the first keyword, abort with the API
      // error so the user knows to wait / increase quota. Soft-fail on
      // later keywords so partial results still come back.
      if (ids.size === 0) throw err;
      console.warn("[youtube] search failed for keyword", kw, err);
    }
  }
  if (ids.size === 0) return [];

  // ---- Step 2: channels.list batched (50 ids per call) → details ----
  const allIds = Array.from(ids);
  const rows: YTCreatorRow[] = [];
  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50);
    const details = await fetchChannelDetails(key, batch);
    rows.push(...details);
  }

  // ---- Step 3: filter + sort + cap ----
  const minSubs = input.minSubscribers ?? 0;
  const maxSubs = input.maxSubscribers ?? 0;
  const creatorsOnly = input.creatorsOnly !== false;

  let filtered = rows.filter((r) => {
    if (r.subscribers === 0 && r.viewCount === null) return false; // hidden / empty channel
    if (minSubs > 0 && r.subscribers < minSubs) return false;
    if (maxSubs > 0 && r.subscribers > maxSubs) return false;
    if (creatorsOnly && !r.isCreator) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return b.subscribers - a.subscribers;
  });

  return filtered.slice(0, cap);
}

/**
 * Same as `searchYTCreators` but never filters — useful when the UI
 * wants to show "X channels found, Y filtered out". Cheap second pass
 * (we already have all the rows in memory if we want).
 */
export async function searchYTCreatorsBoth(input: YTDiscoveryInput): Promise<{
  all: YTCreatorRow[];
  filtered: YTCreatorRow[];
}> {
  // Run unfiltered first, then apply filters in memory — same API cost.
  const raw = await searchYTCreators({ ...input, creatorsOnly: false, minSubscribers: 0, maxSubscribers: 0, maxChannels: 200 });
  const minSubs = input.minSubscribers ?? 0;
  const maxSubs = input.maxSubscribers ?? 0;
  const creatorsOnly = input.creatorsOnly !== false;
  const cap = Math.min(Math.max(input.maxChannels ?? 50, 10), 200);

  const filtered = raw
    .filter((r) => {
      if (minSubs > 0 && r.subscribers < minSubs) return false;
      if (maxSubs > 0 && r.subscribers > maxSubs) return false;
      if (creatorsOnly && !r.isCreator) return false;
      return true;
    })
    .slice(0, cap);

  return { all: raw, filtered };
}

// --------------------------------------------------------------------------
// Step 1: search.list — returns channel ids matching `q`
// --------------------------------------------------------------------------
async function searchChannelIds(
  key: string,
  query: string,
  maxResults: number,
  opts: YTDiscoveryInput
): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", key);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(50, Math.max(1, maxResults))));
  if (opts.country) url.searchParams.set("regionCode", opts.country.toUpperCase());
  if (opts.language) url.searchParams.set("relevanceLanguage", opts.language.toLowerCase());

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const detail = await safeJsonError(res);
    if (res.status === 403 && /quota/i.test(detail)) {
      throw new YTApiError(
        "YouTube quota exceeded for today. Each search costs 100 units; the free tier resets at midnight Pacific Time. Request a higher quota in Google Cloud Console if you need more.",
        res.status
      );
    }
    if (res.status === 400 && /key/i.test(detail)) {
      throw new YTApiError(
        "YOUTUBE_API_KEY is invalid or doesn't have YouTube Data API v3 enabled. Enable it at https://console.cloud.google.com/apis/library/youtube.googleapis.com",
        res.status
      );
    }
    throw new YTApiError(
      `YouTube search failed (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }
  const json = (await res.json()) as {
    items?: Array<{ id?: { channelId?: string }; snippet?: { channelId?: string } }>;
  };
  const ids: string[] = [];
  for (const it of json.items ?? []) {
    const id = it.id?.channelId ?? it.snippet?.channelId;
    if (id) ids.push(id);
  }
  return ids;
}

// --------------------------------------------------------------------------
// Step 2: channels.list — full metadata for a batch of channel ids
// --------------------------------------------------------------------------
type YTChannelApi = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    country?: string;
    defaultLanguage?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
  brandingSettings?: {
    channel?: { keywords?: string; country?: string; defaultLanguage?: string };
    image?: { bannerExternalUrl?: string };
  };
};

async function fetchChannelDetails(
  key: string,
  ids: string[]
): Promise<YTCreatorRow[]> {
  if (ids.length === 0) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("key", key);
  url.searchParams.set("part", "snippet,statistics,brandingSettings");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", String(Math.min(50, ids.length)));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DETAILS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const detail = await safeJsonError(res);
    throw new YTApiError(
      `YouTube channels.list failed (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }
  const json = (await res.json()) as { items?: YTChannelApi[] };
  const out: YTCreatorRow[] = [];
  for (const it of json.items ?? []) {
    const row = normalizeChannel(it);
    if (row) out.push(row);
  }
  return out;
}

async function safeJsonError(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    try {
      const obj = JSON.parse(txt);
      const reason = obj?.error?.errors?.[0]?.reason ?? obj?.error?.status ?? "";
      const msg = obj?.error?.message ?? "";
      return `${reason ? reason + " — " : ""}${msg || txt}`;
    } catch {
      return txt;
    }
  } catch {
    return "";
  }
}

// --------------------------------------------------------------------------
// Normalisation + smart creator detection
// --------------------------------------------------------------------------
const BRAND_NAME_RE =
  /\b(official|inc\.?|llc|corp\.?|corporation|records|studios?|pictures|productions?|network|networks|entertainment|media|news|tv|company|co\.|ltd|gmbh|s\.a\.|broadcasting)\b/i;
const BRAND_DESC_RE =
  /\b(official (channel|youtube)|welcome to the official|subscribe to (our|the) official|all rights reserved|copyright \d{4})/i;

function classifyCreator(args: {
  title: string;
  description: string;
  subscribers: number;
}): { isCreator: boolean; note: string } {
  const { title, description, subscribers } = args;
  if (BRAND_NAME_RE.test(title)) {
    return { isCreator: false, note: "Channel name matches brand/corporate pattern" };
  }
  if (BRAND_DESC_RE.test(description)) {
    return { isCreator: false, note: "Description self-identifies as an official channel" };
  }
  if (subscribers >= 50_000_000) {
    return {
      isCreator: false,
      note: "50M+ subs typically indicates a corporate / mega-brand account",
    };
  }
  return { isCreator: true, note: "" };
}

function computeQualityScore(args: {
  subscribers: number;
  videoCount: number | null;
  isCreator: boolean;
}): number {
  if (!args.isCreator) return 20;
  const { subscribers, videoCount } = args;
  let score = 50;
  if (subscribers >= 10_000 && subscribers <= 500_000) score += 25;
  else if (subscribers >= 1_000 && subscribers < 10_000) score += 15;
  else if (subscribers > 500_000 && subscribers <= 5_000_000) score += 10;
  if (videoCount && videoCount >= 20) score += 10;
  if (videoCount && videoCount >= 100) score += 5;
  return Math.max(0, Math.min(100, score));
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
function extractEmail(description: string): string | null {
  const m = description.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function pickThumbnail(thumbs?: Record<string, { url?: string }>): string | null {
  if (!thumbs) return null;
  return (
    thumbs.high?.url ??
    thumbs.medium?.url ??
    thumbs.default?.url ??
    null
  );
}

function normalizeChannel(it: YTChannelApi): YTCreatorRow | null {
  const channelId = it.id;
  if (!channelId) return null;
  const title = (it.snippet?.title ?? "").trim();
  if (!title) return null;

  const description = (it.snippet?.description ?? "").trim();
  const customUrl = it.snippet?.customUrl ?? null;
  const country = it.snippet?.country ?? it.brandingSettings?.channel?.country ?? null;
  const language =
    it.snippet?.defaultLanguage ?? it.brandingSettings?.channel?.defaultLanguage ?? null;
  const category = it.brandingSettings?.channel?.keywords ?? null;

  const subStr = it.statistics?.subscriberCount;
  const hiddenSubs = !!it.statistics?.hiddenSubscriberCount;
  const subscribers = hiddenSubs ? 0 : (subStr ? parseInt(subStr, 10) || 0 : 0);
  const videoCount = it.statistics?.videoCount ? parseInt(it.statistics.videoCount, 10) : null;
  const viewCount = it.statistics?.viewCount ?? null;

  const channelUrl = customUrl
    ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : "@" + customUrl}`
    : `https://www.youtube.com/channel/${channelId}`;
  const handle = customUrl?.startsWith("@")
    ? customUrl
    : customUrl
      ? `@${customUrl}`
      : null;

  const { isCreator, note } = classifyCreator({ title, description, subscribers });

  return {
    channelId,
    handle,
    title,
    description,
    subscribers,
    videoCount,
    viewCount,
    country,
    language,
    category,
    email: extractEmail(description),
    thumbnailUrl: pickThumbnail(it.snippet?.thumbnails),
    bannerUrl: it.brandingSettings?.image?.bannerExternalUrl ?? null,
    channelUrl,
    customUrl,
    /** YT Data API doesn't expose verification — leave as false. */
    isVerified: false,
    isCreator,
    detectionNote: note,
    qualityScore: computeQualityScore({ subscribers, videoCount, isCreator }),
  };
}

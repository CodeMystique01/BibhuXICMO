/**
 * Apify YouTube creator-discovery integration (QuickAds-style).
 *
 * Mirrors the async pattern from `instagram-apify-network.ts`:
 *
 *   1. POST /v2/acts/{actor}/runs       → returns { runId, datasetId, status }
 *   2. GET  /v2/actor-runs/{runId}      → poll until status === SUCCEEDED
 *   3. GET  /v2/datasets/{id}/items     → fetch the rows + normalize
 *
 * Default actor is `streamers~youtube-scraper` which accepts a list of
 * search keywords and returns video items annotated with channel-level
 * metadata. We group rows by channel and emit one YTCreator per channel.
 *
 * Override APIFY_YT_ACTOR_ID to plug in a different actor — the
 * normaliser keeps best-effort field aliases so most YouTube actors
 * with channel data Just Work.
 *
 * Smart creator detection (QuickAds parity):
 *   The QuickAds tool's killer feature is filtering out "official brand"
 *   channels — corporate TV networks, record labels, news outlets, etc.
 *   We replicate that with a heuristic that flags channels whose name,
 *   description, or join-date pattern looks corporate, and surface that
 *   as `isCreator: false` + `detectionNote: "Looks like a brand channel"`.
 */
import { env } from "@/shared/env";

const RUN_START_TIMEOUT_MS = 30_000;
const STATUS_FETCH_TIMEOUT_MS = 15_000;
const DATASET_FETCH_TIMEOUT_MS = 60_000;

export class ApifyYTError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyYTError";
  }
}

export class ApifyYTNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN (or APIFY_YT_TOKEN) is not configured");
    this.name = "ApifyYTNotConfiguredError";
  }
}

function apifyToken(): string {
  const token = env.APIFY_YT_TOKEN || env.APIFY_TOKEN;
  if (!token) throw new ApifyYTNotConfiguredError();
  return token;
}

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------
export type YTDiscoveryInput = {
  /** Free-text keyword(s) — e.g. ["fitness coach", "calisthenics tutorial"]. */
  keywords: string[];
  /** ISO 3166-1 alpha-2, e.g. "US" or "IN". Optional — passed to actor when set. */
  country?: string;
  /** BCP-47 language code, e.g. "en", "hi". Optional. */
  language?: string;
  /** Min subscriber filter (post-fetch). Default 0. */
  minSubscribers?: number;
  /** Max subscriber filter (post-fetch). 0 = no cap. Default 0. */
  maxSubscribers?: number;
  /** Hard cap on result channels. Default 50. */
  maxChannels?: number;
  /** When true, exclude channels flagged as corporate/brand. Default true. */
  creatorsOnly?: boolean;
};

export type YTRunHandle = {
  runId: string;
  datasetId: string;
  status: string;
  actor: string;
};

export type YTCreatorRow = {
  channelId: string;
  handle: string | null;
  title: string;
  description: string;
  subscribers: number;
  videoCount: number | null;
  /** Aggregate channel views (lifetime). bigint as string to avoid overflow. */
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
  /** Heuristic result + reason. */
  isCreator: boolean;
  detectionNote: string;
  qualityScore: number; // 0-100
};

export type YTRunStatus = {
  status: string;
  statusMessage?: string;
  datasetId?: string;
  startedAt?: string;
  finishedAt?: string;
};

// --------------------------------------------------------------------------
// 1. Start a run
// --------------------------------------------------------------------------
export async function startYTRun(
  input: YTDiscoveryInput
): Promise<YTRunHandle> {
  const token = apifyToken();
  const actor = env.APIFY_YT_ACTOR_ID;

  const keywords = input.keywords
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    throw new ApifyYTError("At least one search keyword is required.");
  }

  // streamers~youtube-scraper canonical input. Most other YT actors accept
  // a superset of these keys, so we send the union — Apify silently ignores
  // unknown fields.
  const cap = Math.min(Math.max(input.maxChannels ?? 50, 10), 200);
  const body: Record<string, unknown> = {
    searchKeywords: keywords.slice(0, 8),
    searchQueries: keywords.slice(0, 8),
    maxResults: cap * 3, // grab 3x channels' worth of videos to dedupe later
    maxResultsShorts: 0,
    maxResultStreams: 0,
  };
  if (input.country) {
    body.country = input.country.toUpperCase();
    body.proxyConfiguration = {
      useApifyProxy: true,
      apifyProxyCountry: input.country.toUpperCase(),
    };
  }
  if (input.language) {
    body.language = input.language.toLowerCase();
  }

  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs` +
    `?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), RUN_START_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyYTError(
      `Apify YT run start failed (${res.status}) for actor ${actor}` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  if (!json.data?.id || !json.data?.defaultDatasetId) {
    throw new ApifyYTError(
      `Apify YT response missing runId/datasetId for actor ${actor}`
    );
  }
  return {
    runId: json.data.id,
    datasetId: json.data.defaultDatasetId,
    status: json.data.status ?? "READY",
    actor,
  };
}

// --------------------------------------------------------------------------
// 2. Poll run status
// --------------------------------------------------------------------------
export async function getYTRunStatus(runId: string): Promise<YTRunStatus> {
  const token = apifyToken();
  const url =
    `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}` +
    `?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), STATUS_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    throw new ApifyYTError(
      `Failed to fetch Apify YT run status (${res.status})`,
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: {
      status?: string;
      statusMessage?: string;
      defaultDatasetId?: string;
      startedAt?: string;
      finishedAt?: string;
    };
  };
  return {
    status: json.data?.status ?? "UNKNOWN",
    statusMessage: json.data?.statusMessage,
    datasetId: json.data?.defaultDatasetId,
    startedAt: json.data?.startedAt,
    finishedAt: json.data?.finishedAt,
  };
}

export function isTerminalYTStatus(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status);
}

// --------------------------------------------------------------------------
// 3. Fetch dataset items + group + normalize per-channel
// --------------------------------------------------------------------------
export async function fetchYTDataset(
  datasetId: string,
  opts: { minSubscribers?: number; maxSubscribers?: number; maxChannels?: number; creatorsOnly?: boolean } = {}
): Promise<YTCreatorRow[]> {
  const token = apifyToken();
  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items` +
    `?token=${encodeURIComponent(token)}&format=json&clean=true`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DATASET_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    throw new ApifyYTError(
      `Failed to fetch Apify YT dataset (${res.status})`,
      res.status
    );
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];

  // Group by channel. We keep the highest-view video's metadata as the
  // canonical channel snapshot (sub counts are sometimes only present on
  // some video rows depending on the actor).
  const byChannel = new Map<string, YTCreatorRow>();
  for (const item of items) {
    const row = normalizeChannel(item);
    if (!row) continue;
    const existing = byChannel.get(row.channelId);
    if (!existing) {
      byChannel.set(row.channelId, row);
      continue;
    }
    // Merge: prefer the row with non-null subscribers, then the higher
    // subscriber count (fixes intermittent missing fields).
    if (
      (existing.subscribers === 0 && row.subscribers > 0) ||
      row.subscribers > existing.subscribers
    ) {
      byChannel.set(row.channelId, { ...existing, ...row });
    }
  }

  let rows = Array.from(byChannel.values());

  const minSubs = opts.minSubscribers ?? 0;
  const maxSubs = opts.maxSubscribers ?? 0;
  rows = rows.filter((r) => {
    if (minSubs > 0 && r.subscribers < minSubs) return false;
    if (maxSubs > 0 && r.subscribers > maxSubs) return false;
    return true;
  });

  if (opts.creatorsOnly !== false) {
    rows = rows.filter((r) => r.isCreator);
  }

  // Sort: real creators first, then by quality score desc, then by subs desc.
  rows.sort((a, b) => {
    if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return b.subscribers - a.subscribers;
  });

  const cap = Math.min(Math.max(opts.maxChannels ?? 50, 10), 200);
  return rows.slice(0, cap);
}

// --------------------------------------------------------------------------
// Normalization helpers
// --------------------------------------------------------------------------
function readString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() && v !== "N/A") return v.trim();
  }
  return null;
}

function readNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && v !== "N/A") {
      const n = parseHumanNumber(v);
      if (n !== null) return n;
    }
  }
  return null;
}

function readBool(obj: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      if (/^(true|yes|verified)$/i.test(v)) return true;
      if (/^(false|no)$/i.test(v)) return false;
    }
  }
  return false;
}

/** Parse "1.2M subscribers" / "245K" / "1,234" / "1234" into a number. */
function parseHumanNumber(s: string): number | null {
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMBkmb])?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] ?? "").toUpperCase();
  if (suf === "K") return Math.round(n * 1_000);
  if (suf === "M") return Math.round(n * 1_000_000);
  if (suf === "B") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

function extractChannelIdFromUrl(url: string): string | null {
  // https://www.youtube.com/channel/UCxxxx
  const m1 = url.match(/\/channel\/(UC[\w-]{20,})/);
  if (m1) return m1[1];
  // https://www.youtube.com/@handle  — no canonical channelId, fall back to @handle as id.
  const m2 = url.match(/\/@([\w.-]+)/);
  if (m2) return `@${m2[1]}`;
  // /c/customUrl
  const m3 = url.match(/\/c\/([\w.-]+)/);
  if (m3) return `c/${m3[1]}`;
  // /user/legacyUsername
  const m4 = url.match(/\/user\/([\w.-]+)/);
  if (m4) return `u/${m4[1]}`;
  return null;
}

function extractHandle(url: string, title: string): string | null {
  const m = url.match(/\/@([\w.-]+)/);
  if (m) return `@${m[1]}`;
  // Some actors emit a handle field directly.
  void title;
  return null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
function extractEmail(...sources: (string | null | undefined)[]): string | null {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(EMAIL_RE);
    if (m && m[0]) return m[0].toLowerCase();
  }
  return null;
}

/**
 * Smart creator detection — flag corporate / brand channels.
 *
 * Heuristic mirrors the QuickAds Python `auto_negotiator.py` approach but
 * tuned to the metadata Apify gives us (no API key, no channel category).
 */
const BRAND_NAME_RE = /\b(official|inc\.?|llc|corp\.?|corporation|records|studios?|pictures|productions?|network|networks|entertainment|media|news|tv|channel|company|co\.|ltd)\b/i;
const BRAND_DESC_RE = /\b(official (channel|youtube)|welcome to the official|subscribe to (our|the) official|all rights reserved|copyright \d{4})/i;

function classifyCreator(args: {
  title: string;
  description: string;
  subscribers: number;
  isVerified: boolean;
}): { isCreator: boolean; note: string } {
  const { title, description, subscribers, isVerified } = args;

  if (BRAND_NAME_RE.test(title)) {
    return {
      isCreator: false,
      note: "Channel name matches brand/corporate pattern",
    };
  }
  if (BRAND_DESC_RE.test(description)) {
    return {
      isCreator: false,
      note: "Description self-identifies as official channel",
    };
  }
  if (isVerified && subscribers >= 10_000_000) {
    return {
      isCreator: false,
      note: "Verified mega-channel — likely a brand / record label / TV network",
    };
  }
  if (subscribers >= 50_000_000) {
    return {
      isCreator: false,
      note: "50M+ subs typically indicates a corporate / mega-creator account",
    };
  }
  return { isCreator: true, note: "" };
}

/**
 * Map (subscribers, video count, verification) → 0-100 quality score.
 * Sweet-spot favors the 10K–500K micro/mid band that creator marketers target.
 */
function computeQualityScore(args: {
  subscribers: number;
  videoCount: number | null;
  isVerified: boolean;
  isCreator: boolean;
}): number {
  if (!args.isCreator) return 20;
  const { subscribers, videoCount, isVerified } = args;
  let score = 50;
  if (subscribers >= 10_000 && subscribers <= 500_000) score += 25;
  else if (subscribers >= 1_000 && subscribers < 10_000) score += 15;
  else if (subscribers > 500_000 && subscribers <= 5_000_000) score += 10;
  if (videoCount && videoCount >= 20) score += 10;
  if (videoCount && videoCount >= 100) score += 5;
  if (isVerified) score += 5;
  return Math.max(0, Math.min(100, score));
}

function normalizeChannel(raw: unknown): YTCreatorRow | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const channelUrl =
    readString(obj, "channelUrl", "channel_url", "channelLink", "channel") ??
    "";
  if (!channelUrl) return null;

  const channelId =
    readString(obj, "channelId", "channel_id") ??
    extractChannelIdFromUrl(channelUrl);
  if (!channelId) return null;

  const title =
    readString(obj, "channelName", "channelTitle", "channel_name", "channel") ??
    "";
  if (!title) return null;

  const description = readString(obj, "channelDescription", "description") ?? "";
  const subscribers =
    readNumber(
      obj,
      "numberOfSubscribers",
      "channelSubscribers",
      "subscribers",
      "subscriberCount"
    ) ?? 0;
  const videoCount = readNumber(
    obj,
    "channelVideosCount",
    "channelVideoCount",
    "videoCount",
    "totalVideos"
  );
  const viewCount = readNumber(
    obj,
    "channelTotalViews",
    "channelViewCount",
    "totalViews",
    "viewCount"
  );
  const country = readString(
    obj,
    "channelLocation",
    "channelCountry",
    "country"
  );
  const isVerified = readBool(
    obj,
    "isChannelVerified",
    "channelVerified",
    "isVerified",
    "verified"
  );
  const customUrl = readString(obj, "customUrl", "channelCustomUrl");
  const thumbnailUrl = readString(
    obj,
    "channelThumbnail",
    "channelAvatar",
    "channelImage",
    "thumbnail"
  );
  const bannerUrl = readString(obj, "channelBanner", "banner");
  const handle = extractHandle(channelUrl, title) ??
    (customUrl?.startsWith("@") ? customUrl : null);

  const { isCreator, note } = classifyCreator({
    title,
    description,
    subscribers,
    isVerified,
  });

  const email = extractEmail(description, readString(obj, "channelEmail", "email"));

  return {
    channelId,
    handle,
    title,
    description,
    subscribers,
    videoCount,
    viewCount: viewCount !== null ? String(viewCount) : null,
    country,
    language: readString(obj, "channelLanguage", "language"),
    category: readString(obj, "channelCategory", "category"),
    email,
    thumbnailUrl,
    bannerUrl,
    channelUrl,
    customUrl,
    isVerified,
    isCreator,
    detectionNote: note,
    qualityScore: computeQualityScore({
      subscribers,
      videoCount,
      isVerified,
      isCreator,
    }),
  };
}

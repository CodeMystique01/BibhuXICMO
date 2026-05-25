/**
 * Apify network-expansion influencer discovery (QuickAds-style).
 *
 * This module talks to `afanasenko~instagram-profile-scraper` (or whatever
 * `APIFY_IG_NETWORK_ACTOR_ID` is set to) using the async pattern:
 *
 *   1. POST /v2/acts/{actor}/runs       → returns { runId, datasetId, status }
 *   2. GET  /v2/actor-runs/{runId}      → poll until status === SUCCEEDED
 *   3. GET  /v2/datasets/{id}/items     → fetch the rows
 *
 * We CANNOT use Apify's `run-sync-get-dataset-items` endpoint here because
 * a network-expansion run with 50–100 profiles routinely takes 2–5 minutes,
 * well past Render's ~100s request proxy timeout. The async pattern lets
 * the browser poll every few seconds while the run keeps going server-side.
 *
 * The actor's output rows use PascalCase keys with spaces:
 *   "Account", "Full Name", "Followers Count", "Following Count",
 *   "Total Posts", "Posts per Month", "Biography", "Category",
 *   "Email", "Email Source", "External URL", "Median ER" (e.g. "2.45%"),
 *   "Quality" (Excellent / Good / Average / Poor), "Avg Likes",
 *   "Avg Comments", "Verified", "Profile Picture", "Source".
 *
 * Missing fields come back as the string `"N/A"` rather than null, so we
 * treat that as null when parsing.
 */
import { env } from "@/shared/env";

const RUN_START_TIMEOUT_MS = 30_000; // POST should return quickly (<5s usually)
const STATUS_FETCH_TIMEOUT_MS = 15_000;
const DATASET_FETCH_TIMEOUT_MS = 60_000;

export class ApifyIGNetworkError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyIGNetworkError";
  }
}

export class ApifyIGNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN (or APIFY_IG_TOKEN) is not configured");
    this.name = "ApifyIGNotConfiguredError";
  }
}

function apifyToken(): string {
  const token = env.APIFY_IG_TOKEN || env.APIFY_TOKEN;
  if (!token) throw new ApifyIGNotConfiguredError();
  return token;
}

export type IGNetworkRunInput = {
  seeds: string[];
  /** Minimum followers (actor-side filter — over-cap profiles cost nothing). */
  minFollowers?: number;
  /** Maximum followers. 0 = no cap. */
  maxFollowers?: number;
  /** Hard cap on profiles to analyze. Each analyzed profile = $0.01. */
  maxProfiles?: number;
  /** When true (default), extracts email from bio + contact button. */
  extractEmail?: boolean;
  /** When true (default), adds Median ER + Quality + Avg Likes/Comments columns. */
  analyzeQuality?: boolean;
  /** Maps to actor `profileLanguage` filter (e.g. "English"). */
  language?: string;
};

export type IGKeywordRunInput = {
  /** Free-text niche keywords — e.g. "fitness coach, personal trainer". */
  keywords: string[];
  minFollowers?: number;
  maxFollowers?: number;
  maxProfiles?: number;
  extractEmail?: boolean;
  analyzeQuality?: boolean;
  language?: string;
};

export type IGNetworkRunHandle = {
  runId: string;
  datasetId: string;
  status: string;
  actor: string;
};

export type IGNetworkProfile = {
  /** Plain handle without `@` prefix. */
  handle: string;
  fullName: string;
  followers: number;
  following: number | null;
  postsCount: number | null;
  bio: string;
  category: string;
  email: string | null;
  externalUrl: string | null;
  /** 0-1 fraction (e.g. 0.0245 for 2.45%). */
  engagementRate: number | null;
  /** Excellent / Good / Average / Poor / null. */
  qualityLabel: string | null;
  /** 0-100 mapped from qualityLabel (Excellent=90, Good=70, Average=50, Poor=25). */
  qualityScore: number;
  avgLikes: number | null;
  avgComments: number | null;
  postsPerMonth: number | null;
  isVerified: boolean;
  profilePicture: string | null;
  profileUrl: string;
  /** "Network Expansion of <seed>" etc. */
  source: string;
};

// --------------------------------------------------------------------------
// 1. Start a run
// --------------------------------------------------------------------------
export async function startIGNetworkRun(
  input: IGNetworkRunInput
): Promise<IGNetworkRunHandle> {
  const token = apifyToken();
  const actor = env.APIFY_IG_NETWORK_ACTOR_ID;

  const seeds = input.seeds
    .map((s) =>
      String(s ?? "")
        .trim()
        .replace(/^@/, "")
        .replace(/\/+$/, "")
        .toLowerCase()
    )
    .filter(Boolean);

  if (seeds.length === 0) {
    throw new ApifyIGNetworkError("At least one seed account is required.");
  }

  // Keep input MINIMAL — the QuickAds team learned the hard way that extra
  // filters tighten the actor's heuristics and routinely return 0 rows.
  const body: Record<string, unknown> = {
    operationMode: "networkExpansion",
    startUsernames: seeds,
    // Mode-3 specific cap. The actor reads `maxCountExpansion` for Mode 3;
    // we also send the generic `maxCount` so callers can override either.
    maxCountExpansion: Math.min(input.maxProfiles ?? 100, 500),
    maxCount: Math.min(input.maxProfiles ?? 100, 500),
    searchDepth: "1",
    extractEmail: input.extractEmail ?? true,
    analyzeQuality: input.analyzeQuality ?? true,
  };
  if (input.minFollowers && input.minFollowers > 0) {
    body.minFollowers = Number(input.minFollowers);
  }
  if (input.maxFollowers && input.maxFollowers > 0) {
    body.maxFollowers = Number(input.maxFollowers);
  }
  if (input.language) {
    body.profileLanguage = input.language;
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
    throw new ApifyIGNetworkError(
      `Apify run start failed (${res.status}) for actor ${actor}` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
      res.status
    );
  }

  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };

  if (!json.data?.id || !json.data?.defaultDatasetId) {
    throw new ApifyIGNetworkError(
      `Apify response missing runId/datasetId for actor ${actor}`
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
// 1b. Keyword-discovery fallback (Mode 4)
// --------------------------------------------------------------------------
//
// Used when Mode 3 (networkExpansion) returns 0 profiles. The QuickAds team
// learned that very-narrow seed graphs (single seed, niche too small, or
// celebrity accounts whose graph doesn't surface micro-influencers) can
// produce empty Mode-3 datasets — Mode 4 rescues those queries by searching
// hashtags + free-text queries instead.
function toHashtag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

export async function startIGKeywordDiscoveryRun(
  input: IGKeywordRunInput
): Promise<IGNetworkRunHandle> {
  const token = apifyToken();
  const actor = env.APIFY_IG_NETWORK_ACTOR_ID;

  const keywords = input.keywords
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, 8);
  if (keywords.length === 0) {
    throw new ApifyIGNetworkError(
      "At least one niche keyword is required for keyword discovery."
    );
  }
  const hashtags = keywords
    .map(toHashtag)
    .filter((t) => t.length >= 3)
    .slice(0, 5);

  const body: Record<string, unknown> = {
    operationMode: "keywordDiscovery",
    searchQueries: keywords.slice(0, 5),
    searchHashtags: hashtags,
    maxSearchPagesPerQuery: 5,
    maxCountDiscovery: Math.max(50, Math.min(input.maxProfiles ?? 100, 500)),
    maxCount: Math.max(50, Math.min(input.maxProfiles ?? 100, 500)),
    extractEmail: input.extractEmail ?? true,
    analyzeQuality: input.analyzeQuality ?? true,
    filterCombination: "OR",
  };
  if (input.minFollowers && input.minFollowers > 0) {
    body.minFollowers = Number(input.minFollowers);
  }
  if (input.maxFollowers && input.maxFollowers > 0) {
    body.maxFollowers = Number(input.maxFollowers);
  }
  if (input.language) {
    body.profileLanguage = input.language;
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
    throw new ApifyIGNetworkError(
      `Apify keyword-discovery run failed (${res.status})` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  if (!json.data?.id || !json.data?.defaultDatasetId) {
    throw new ApifyIGNetworkError(
      `Apify keyword-discovery response missing ids`
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
export type IGRunStatus = {
  /** READY | RUNNING | SUCCEEDED | FAILED | ABORTED | TIMING-OUT | TIMED-OUT */
  status: string;
  statusMessage?: string;
  datasetId?: string;
  startedAt?: string;
  finishedAt?: string;
};

export async function getIGRunStatus(runId: string): Promise<IGRunStatus> {
  const token = apifyToken();
  const url = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), STATUS_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    throw new ApifyIGNetworkError(
      `Failed to fetch Apify run status (${res.status})`,
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

export function isTerminalIGStatus(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status);
}

// --------------------------------------------------------------------------
// 3. Fetch dataset items + normalize
// --------------------------------------------------------------------------
export async function fetchIGNetworkDataset(
  datasetId: string
): Promise<IGNetworkProfile[]> {
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
    throw new ApifyIGNetworkError(
      `Failed to fetch Apify dataset (${res.status})`,
      res.status
    );
  }
  const items = await res.json();
  if (!Array.isArray(items)) return [];

  const out: IGNetworkProfile[] = [];
  for (const item of items) {
    const p = normalizeNetworkProfile(item);
    if (p) out.push(p);
  }
  return out;
}

// --------------------------------------------------------------------------
// Normalization helpers (the actor returns "N/A" for missing fields)
// --------------------------------------------------------------------------
function asStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s === "N/A" || s.toLowerCase() === "n/a") return null;
  return s;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "N/A") return null;
    const cleaned = t.replace(/[,\s$]/g, "").replace(/%$/, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asPercent(v: unknown): number | null {
  // "2.45%" → 0.0245 ; 2.45 → 0.0245 ; 0.0245 → 0.0245
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "N/A") return null;
    const n = parseFloat(t.replace("%", ""));
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 1 ? v / 100 : v;
  }
  return null;
}

function qualityToScore(q: string | null): number {
  switch (q) {
    case "Excellent":
      return 90;
    case "Good":
      return 70;
    case "Average":
      return 50;
    case "Poor":
      return 25;
    default:
      return 0;
  }
}

function pickFirst(
  o: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
  }
  return undefined;
}

function normalizeNetworkProfile(item: unknown): IGNetworkProfile | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;

  const accountUrl = asStr(pickFirst(o, ["Account", "account", "Profile URL", "profileUrl"]));
  let handle: string | null = null;
  if (accountUrl) {
    handle = accountUrl
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\/+/i, "")
      .replace(/\/+$/, "")
      .split("/")[0]
      .toLowerCase();
  }
  if (!handle) {
    handle = asStr(pickFirst(o, ["Username", "username", "Handle", "handle"]));
    if (handle) handle = handle.replace(/^@/, "").toLowerCase();
  }
  if (!handle) return null;

  const followers = asNum(pickFirst(o, ["Followers Count", "followersCount", "followers"])) ?? 0;
  const following = asNum(pickFirst(o, ["Following Count", "followingCount", "following"]));
  const postsCount = asNum(pickFirst(o, ["Total Posts", "postsCount", "posts"]));
  const bio = asStr(pickFirst(o, ["Biography", "biography", "bio"])) ?? "";
  const category = asStr(pickFirst(o, ["Category", "category"])) ?? "";
  const email = asStr(pickFirst(o, ["Email", "email"]));
  const externalUrl = asStr(pickFirst(o, ["External URL", "externalUrl", "website"]));
  const engagementRate = asPercent(pickFirst(o, ["Median ER", "engagementRate", "engagement_rate"]));
  const qualityLabel = asStr(pickFirst(o, ["Quality", "quality"]));
  const avgLikes = asNum(pickFirst(o, ["Avg Likes", "avgLikes"]));
  const avgComments = asNum(pickFirst(o, ["Avg Comments", "avgComments"]));
  const postsPerMonth = asNum(pickFirst(o, ["Posts per Month", "postsPerMonth"]));
  const profilePicture = asStr(pickFirst(o, ["Profile Picture", "profilePicture", "profilePic"]));
  const isVerified =
    o["Verified"] === true || o["verified"] === true || o["isVerified"] === true;
  const fullName = asStr(pickFirst(o, ["Full Name", "fullName", "name"])) ?? "";
  const source = asStr(pickFirst(o, ["Source", "source"])) ?? "";

  return {
    handle,
    fullName,
    followers,
    following,
    postsCount,
    bio,
    category,
    email,
    externalUrl,
    engagementRate,
    qualityLabel,
    qualityScore: qualityToScore(qualityLabel),
    avgLikes,
    avgComments,
    postsPerMonth,
    isVerified,
    profilePicture,
    profileUrl: accountUrl ?? `https://www.instagram.com/${handle}/`,
    source,
  };
}

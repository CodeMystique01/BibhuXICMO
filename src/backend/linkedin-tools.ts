/**
 * Async dispatcher + 24h DB cache for the LinkedIn agent's two Apify tools.
 *
 * Mirrors `seo-tools-cache.ts`:
 *   1. Start the Apify run (returns instantly).
 *   2. Return {pending, runId, datasetId} to the client.
 *   3. Client polls pollLinkedInToolAction.
 *   4. On SUCCEEDED we fetch + normalize + persist to `LinkedInScan`, so a
 *      repeat of the same input hits the cache and skips Apify entirely.
 */
import { createHash } from "crypto";
import type { Prisma, LinkedInScanType } from "@prisma/client";
import { prisma } from "@/backend/db";
import {
  ApifyLinkedInNotConfiguredError,
  ApifyLinkedInError,
  getLinkedInRunStatus,
  fetchLinkedInDataset,
  isTerminalLinkedInStatus,
  startCompanyPostsRun,
  startProfileRun,
  normalizeCompanyPosts,
  normalizeProfile,
  type LinkedInCompanyPostsResult,
  type LinkedInProfileResult,
} from "@/integrations/linkedin-apify";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_MSG = "Scraping LinkedIn via Apify…";

/** Hard cap so a single run can never balloon Apify spend. */
const MAX_POSTS_CAP = 50;
const MAX_TARGETS = 5;

export type CachedLinkedInResult<T> =
  | { ok: true; data: T; cachedAt: Date; fromCache: boolean }
  | { ok: true; pending: true; runId: string; datasetId: string; message: string }
  | { ok: false; error: string };

export type LinkedInPollInput =
  | {
      type: "COMPANY_POSTS";
      targets: string[];
      maxPosts: number;
      includeReposts: boolean;
      runId: string;
      datasetId: string;
    }
  | {
      type: "PROFILE";
      query: string;
      runId: string;
      datasetId: string;
    };

export type LinkedInPollResult =
  | { ok: true; status: "RUNNING"; statusMessage?: string }
  | {
      ok: true;
      status: "DONE";
      data: LinkedInCompanyPostsResult | LinkedInProfileResult;
      cachedAt: Date;
    }
  | { ok: false; error: string };

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

export function hashInput(input: Record<string, unknown>): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApifyLinkedInNotConfiguredError) {
    return err.message;
  }
  if (err instanceof ApifyLinkedInError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected error talking to Apify.";
}

/** Normalize a LinkedIn URL/identifier for hashing + the actor. */
export function normalizeLinkedInTarget(input: string): string {
  let s = input.trim();
  if (!s) return s;
  // Bare handle → /in/ URL.
  if (!/^https?:\/\//i.test(s) && !s.includes("/")) {
    return `https://www.linkedin.com/in/${s.replace(/^@/, "")}`;
  }
  s = s.replace(/^http:\/\//i, "https://");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function extractPublicIdentifier(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function readCached<T>(args: {
  workspaceId: string;
  type: LinkedInScanType;
  inputHash: string;
  ttlMs: number;
}): Promise<{ result: T; cachedAt: Date } | null> {
  try {
    const row = await prisma.linkedInScan.findUnique({
      where: {
        workspaceId_type_inputHash: {
          workspaceId: args.workspaceId,
          type: args.type,
          inputHash: args.inputHash,
        },
      },
    });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > args.ttlMs) return null;
    return { result: row.result as T, cachedAt: row.createdAt };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return null;
    throw err;
  }
}

async function writeCached(args: {
  workspaceId: string;
  type: LinkedInScanType;
  inputHash: string;
  input: Record<string, unknown>;
  result: unknown;
}): Promise<void> {
  try {
    await prisma.linkedInScan.upsert({
      where: {
        workspaceId_type_inputHash: {
          workspaceId: args.workspaceId,
          type: args.type,
          inputHash: args.inputHash,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        type: args.type,
        inputHash: args.inputHash,
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
      },
      update: {
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021" && code !== "P2022") {
      console.error(`[linkedin-tools] write failed for ${args.type}:`, err);
    }
  }
}

// --------------------------------------------------------------------------
// Start handlers
// --------------------------------------------------------------------------

export async function runCompanyPosts(args: {
  workspaceId: string;
  targets: string[];
  maxPosts?: number;
  includeReposts?: boolean;
}): Promise<CachedLinkedInResult<LinkedInCompanyPostsResult>> {
  const targets = Array.from(
    new Set(args.targets.map(normalizeLinkedInTarget).filter(Boolean))
  ).slice(0, MAX_TARGETS);
  if (targets.length === 0) {
    return { ok: false, error: "Enter at least one company or profile URL." };
  }
  const maxPosts = Math.min(Math.max(args.maxPosts ?? 25, 1), MAX_POSTS_CAP);
  const includeReposts = args.includeReposts ?? true;

  const input = { targets, maxPosts, includeReposts };
  const inputHash = hashInput({ ...input, type: "COMPANY_POSTS" });

  const cached = await readCached<LinkedInCompanyPostsResult>({
    workspaceId: args.workspaceId,
    type: "COMPANY_POSTS",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) {
    return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };
  }

  try {
    const handle = await startCompanyPostsRun({
      targetUrls: targets,
      maxPosts,
      includeReposts,
      includeQuotePosts: true,
    });
    return {
      ok: true,
      pending: true,
      runId: handle.runId,
      datasetId: handle.datasetId,
      message: PENDING_MSG,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runProfile(args: {
  workspaceId: string;
  query: string;
}): Promise<CachedLinkedInResult<LinkedInProfileResult>> {
  const target = normalizeLinkedInTarget(args.query);
  if (!target) return { ok: false, error: "Enter a LinkedIn profile URL." };
  const inputHash = hashInput({ query: target, type: "PROFILE" });

  const cached = await readCached<LinkedInProfileResult>({
    workspaceId: args.workspaceId,
    type: "PROFILE",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) {
    return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };
  }

  try {
    const publicIdentifier = extractPublicIdentifier(target);
    const handle = await startProfileRun(
      publicIdentifier ? { publicIdentifier } : { url: target }
    );
    return {
      ok: true,
      pending: true,
      runId: handle.runId,
      datasetId: handle.datasetId,
      message: PENDING_MSG,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// --------------------------------------------------------------------------
// Unified poll
// --------------------------------------------------------------------------

export async function pollLinkedInTool(
  workspaceId: string,
  input: LinkedInPollInput
): Promise<LinkedInPollResult> {
  const kind = input.type === "PROFILE" ? "profile" : "posts";

  let status: { status: string; statusMessage?: string; datasetId?: string };
  try {
    status = await getLinkedInRunStatus(input.runId, kind);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  if (!isTerminalLinkedInStatus(status.status)) {
    return { ok: true, status: "RUNNING", statusMessage: status.statusMessage };
  }
  if (status.status !== "SUCCEEDED") {
    return {
      ok: false,
      error: `Apify run ${status.status}${status.statusMessage ? ` — ${status.statusMessage}` : ""}`,
    };
  }

  let items: unknown[];
  try {
    items = await fetchLinkedInDataset(status.datasetId ?? input.datasetId, kind);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  if (input.type === "COMPANY_POSTS") {
    const data = normalizeCompanyPosts(items, input.targets);
    const ih = hashInput({
      targets: input.targets,
      maxPosts: input.maxPosts,
      includeReposts: input.includeReposts,
      type: "COMPANY_POSTS",
    });
    await writeCached({
      workspaceId,
      type: "COMPANY_POSTS",
      inputHash: ih,
      input: {
        targets: input.targets,
        maxPosts: input.maxPosts,
        includeReposts: input.includeReposts,
      },
      result: data,
    });
    return { ok: true, status: "DONE", data, cachedAt: new Date() };
  }

  const data = normalizeProfile(items, input.query);
  const ih = hashInput({ query: input.query, type: "PROFILE" });
  await writeCached({
    workspaceId,
    type: "PROFILE",
    inputHash: ih,
    input: { query: input.query },
    result: data,
  });
  return { ok: true, status: "DONE", data, cachedAt: new Date() };
}

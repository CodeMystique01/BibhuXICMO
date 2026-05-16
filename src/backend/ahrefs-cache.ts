/**
 * Workspace-scoped Ahrefs cache.
 *
 * Apify charges per result, so we cache aggressively (24h) and store the
 * snapshot directly on the Workspace row. The /agent/cmo dashboard reads
 * the cache on every page load and only re-runs the actor when stale or
 * the website URL changed.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import {
  fetchAhrefsSnapshot,
  ApifyNotConfiguredError,
  type AhrefsSnapshot,
} from "@/backend/ahrefs";

const TTL_MS = 24 * 60 * 60 * 1000;

export type CachedAhrefsState =
  | { kind: "ready"; snapshot: AhrefsSnapshot; age: "fresh" | "stale" }
  | { kind: "missing"; reason: "no_url" | "not_configured" | "error"; message?: string };

/**
 * Returns the cached snapshot if present (regardless of staleness). Caller
 * is responsible for refreshing in the background if needed.
 */
export function readCachedAhrefs(args: {
  websiteUrl: string | null;
  ahrefsSnapshot: unknown;
  ahrefsSnapshotAt: Date | null;
}): CachedAhrefsState {
  if (!args.websiteUrl) return { kind: "missing", reason: "no_url" };
  if (!args.ahrefsSnapshot || !args.ahrefsSnapshotAt) {
    return { kind: "missing", reason: "error" };
  }
  const snapshot = args.ahrefsSnapshot as AhrefsSnapshot;
  // If cached snapshot was for a different domain, treat as missing so the
  // caller refreshes for the new URL.
  const wantHost = (() => {
    try {
      return new URL(
        args.websiteUrl.startsWith("http")
          ? args.websiteUrl
          : `https://${args.websiteUrl}`
      ).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  if (wantHost && snapshot.domain && snapshot.domain !== wantHost) {
    return { kind: "missing", reason: "error" };
  }

  const age =
    Date.now() - args.ahrefsSnapshotAt.getTime() < TTL_MS ? "fresh" : "stale";
  return { kind: "ready", snapshot, age };
}

/**
 * Fetch the snapshot from cache; refresh from Apify when missing or stale.
 * Designed to be called in parallel with other dashboard fetches — wraps
 * all errors and never throws.
 */
export async function loadAhrefsWithCache(args: {
  workspaceId: string;
  websiteUrl: string | null;
  ahrefsSnapshot: unknown;
  ahrefsSnapshotAt: Date | null;
}): Promise<CachedAhrefsState> {
  const cached = readCachedAhrefs(args);

  // Cache hit, fresh → return directly.
  if (cached.kind === "ready" && cached.age === "fresh") return cached;

  // No URL or other unrecoverable miss → return state as-is.
  if (cached.kind === "missing" && cached.reason === "no_url") return cached;
  if (!args.websiteUrl) return { kind: "missing", reason: "no_url" };

  // Otherwise try to refresh. Bound to 28s so dashboard loads stay snappy.
  try {
    const snapshot = await fetchAhrefsSnapshot(args.websiteUrl, {
      timeoutMs: 28_000,
    });
    await prisma.workspace.update({
      where: { id: args.workspaceId },
      data: {
        ahrefsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        ahrefsSnapshotAt: new Date(),
      },
    });
    return { kind: "ready", snapshot, age: "fresh" };
  } catch (err) {
    if (err instanceof ApifyNotConfiguredError) {
      // Fall back to the stale cache if we have one — better than nothing.
      if (cached.kind === "ready") return { ...cached, age: "stale" };
      return { kind: "missing", reason: "not_configured" };
    }
    if (cached.kind === "ready") return { ...cached, age: "stale" };
    return {
      kind: "missing",
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

"use server";

import { requireWorkspace } from "@/backend/workspace";
import {
  fetchAhrefsSnapshot,
  ApifyNotConfiguredError,
  type AhrefsSnapshot,
} from "@/backend/ahrefs";

export type AhrefsActionResult =
  | { ok: true; snapshot: AhrefsSnapshot }
  | { ok: false; error: string; needsConfig?: true; needsWebsite?: true };

/**
 * Fetch a fresh Ahrefs snapshot for the current workspace's website.
 *
 * Bounded to ~25s so we stay well under typical edge timeouts. Caller can
 * retry — Apify's run-sync endpoint will reuse the actor warm pool.
 */
export async function refreshAhrefsSnapshotAction(): Promise<AhrefsActionResult> {
  const { workspace } = await requireWorkspace();
  if (!workspace.websiteUrl) {
    return {
      ok: false,
      error: "Add a website URL in Settings, then try again.",
      needsWebsite: true,
    };
  }

  try {
    const snapshot = await fetchAhrefsSnapshot(workspace.websiteUrl, {
      timeoutMs: 25_000,
    });
    return { ok: true, snapshot };
  } catch (err) {
    if (err instanceof ApifyNotConfiguredError) {
      return {
        ok: false,
        error: "APIFY_TOKEN is not set on the server.",
        needsConfig: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ahrefs fetch failed.",
    };
  }
}

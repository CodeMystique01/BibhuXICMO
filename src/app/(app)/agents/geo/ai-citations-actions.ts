"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  startAiVisibility,
  getActorRunStatus,
  getDatasetItems,
  isTerminalApifyStatus,
  normalizeAiVisibility,
} from "@/backend/ahrefs-tools";
import { ApifyNotConfiguredError, ApifyAhrefsError } from "@/backend/ahrefs";
import type {
  AiCitationsActionResult,
  AiCitationsBundle,
  AiCitationsPollResult,
  PlatformCounts,
  PlatformKey,
} from "./ai-citations-types";

// ---------------------------------------------------------------------------
// Provider-alias mapping. Apify actors return all kinds of names — normalize.
// ---------------------------------------------------------------------------
function mapProvider(name: string): PlatformKey | null {
  const s = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  if (s.includes("aioverview") || s === "google" || s.includes("googleaio") || s === "aio" || s === "sge")
    return "aiOverviews";
  if (s.includes("chatgpt") || s === "gpt" || s.includes("openai")) return "chatgpt";
  if (s.includes("gemini") || s === "bard") return "gemini";
  if (s.includes("perplexity") || s === "pplx") return "perplexity";
  if (s.includes("copilot") || s.includes("bingchat") || s === "bing") return "copilot";
  if (s.includes("grok") || s === "xai") return "grok";
  return null;
}

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return s;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApifyNotConfiguredError) {
    return "Apify token isn't configured. Set APIFY_SEO_TOKEN (or APIFY_TOKEN) in Render → Environment.";
  }
  if (err instanceof ApifyAhrefsError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function loadLatestSnapshots(workspaceId: string, domain: string, limit = 2) {
  try {
    return await prisma.aiCitationSnapshot.findMany({
      where: { workspaceId, domain },
      orderBy: { fetchedAt: "desc" },
      take: limit,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return [];
    throw err;
  }
}

function snapshotData(snap: { data: unknown }): Partial<Record<PlatformKey, PlatformCounts>> {
  return (snap.data as Partial<Record<PlatformKey, PlatformCounts>>) ?? {};
}

async function saveSnapshot(args: {
  workspaceId: string;
  domain: string;
  country: string;
  data: Partial<Record<PlatformKey, PlatformCounts>>;
  raw: unknown;
}) {
  try {
    return await prisma.aiCitationSnapshot.create({
      data: {
        workspaceId: args.workspaceId,
        domain: args.domain,
        country: args.country,
        data: JSON.parse(JSON.stringify(args.data)) as Prisma.InputJsonValue,
        raw: JSON.parse(JSON.stringify(args.raw ?? null)) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      console.warn("[ai-citations] table missing — run prisma db push");
      return null;
    }
    throw err;
  }
}

function bundleFromSnapshots(
  domain: string,
  country: string,
  snaps: Array<{ fetchedAt: Date; data: unknown }>
): AiCitationsBundle | null {
  if (snaps.length === 0) return null;
  const [latest, prev] = snaps;
  return {
    domain,
    country,
    fetchedAt: latest.fetchedAt.toISOString(),
    previousAt: prev ? prev.fetchedAt.toISOString() : null,
    current: snapshotData(latest),
    previous: prev ? snapshotData(prev) : {},
  };
}

function rawToPlatformCounts(
  rawProviders: Array<{ provider: string; citations: number | null; pages: number | null; mentions: number | null }>
): Partial<Record<PlatformKey, PlatformCounts>> {
  const out: Partial<Record<PlatformKey, PlatformCounts>> = {};
  for (const row of rawProviders) {
    const key = mapProvider(row.provider);
    if (!key) {
      console.warn(`[ai-citations] Unrecognized provider "${row.provider}" — adjust mapProvider() alias table.`);
      continue;
    }
    const citations = row.citations ?? row.mentions ?? 0;
    const pages = row.pages ?? 0;
    out[key] = { citations, pages };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Initial loader — fetches the latest cached bundle, no Apify call.
// ---------------------------------------------------------------------------

export async function loadAiCitationsAction(args?: {
  domain?: string;
}): Promise<AiCitationsActionResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: true, data: null };
  const snaps = await loadLatestSnapshots(workspace.id, domain, 2);
  return { ok: true, data: bundleFromSnapshots(domain, "us", snaps) };
}

/**
 * Returns the raw Apify dataset from the latest snapshot — used by the
 * panel's "View raw response" debug expander when no platforms get
 * parsed, so the user can paste it back to us for field-mapping fixes.
 */
export async function getLatestRawSnapshotAction(args?: {
  domain?: string;
}): Promise<{ ok: true; raw: unknown; fetchedAt: string } | { ok: false; error: string }> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: false, error: "No domain configured." };
  try {
    const row = await prisma.aiCitationSnapshot.findFirst({
      where: { workspaceId: workspace.id, domain },
      orderBy: { fetchedAt: "desc" },
    });
    if (!row) return { ok: false, error: "No snapshot yet — run a check first." };
    return { ok: true, raw: row.raw, fetchedAt: row.fetchedAt.toISOString() };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") {
      return { ok: false, error: "AiCitationSnapshot table missing — run prisma db push." };
    }
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Refresh — start Apify run, return pending handle for client to poll.
// ---------------------------------------------------------------------------

export async function startAiCitationsRefreshAction(args: {
  domain?: string;
  country?: string;
}): Promise<AiCitationsActionResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args.domain ?? workspace.websiteUrl ?? "");
  const country = (args.country ?? "us").toLowerCase();
  if (!domain) return { ok: false, error: "Set your website URL in Settings first." };
  try {
    const handle = await startAiVisibility(domain, country);
    return { ok: true, pending: true, runId: handle.runId, datasetId: handle.datasetId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Poll — called repeatedly by the client until status === DONE.
// ---------------------------------------------------------------------------

export async function pollAiCitationsAction(args: {
  domain: string;
  country: string;
  runId: string;
  datasetId: string;
}): Promise<AiCitationsPollResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args.domain);
  const country = (args.country ?? "us").toLowerCase();

  let status: { status: string; statusMessage?: string; datasetId?: string };
  try {
    status = await getActorRunStatus(args.runId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  if (!isTerminalApifyStatus(status.status)) {
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
    items = await getDatasetItems(status.datasetId ?? args.datasetId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  const av = normalizeAiVisibility(items, { domain });
  const platformCounts = rawToPlatformCounts(av.byProvider);

  // Persist; this becomes the "current" for delta math next time.
  await saveSnapshot({
    workspaceId: workspace.id,
    domain,
    country,
    data: platformCounts,
    raw: items,
  });

  // Reload latest 2 to build the bundle (includes the just-inserted row).
  const snaps = await loadLatestSnapshots(workspace.id, domain, 2);
  const bundle =
    bundleFromSnapshots(domain, country, snaps) ??
    {
      domain,
      country,
      fetchedAt: new Date().toISOString(),
      previousAt: null,
      current: platformCounts,
      previous: {},
    };

  revalidatePath("/agents/geo");
  return { ok: true, status: "DONE", data: bundle };
}

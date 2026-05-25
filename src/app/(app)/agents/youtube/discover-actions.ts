"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  startYTRun,
  getYTRunStatus,
  fetchYTDataset,
  isTerminalYTStatus,
  ApifyYTError,
  ApifyYTNotConfiguredError,
  type YTDiscoveryInput,
  type YTCreatorRow,
} from "@/integrations/youtube-apify";

type StartInput = {
  /** Free-text — comma / newline separated. */
  keywords: string;
  country?: string;
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  maxChannels?: number;
  creatorsOnly?: boolean;
};

export type StartYTDiscoveryResult =
  | {
      ok: true;
      runId: string;
      datasetId: string;
      status: string;
      actor: string;
    }
  | { ok: false; error: string };

function parseKeywords(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 8);
}

/**
 * Kicks off an Apify YouTube discovery run. Returns immediately with
 * `runId` + `datasetId`; the client polls `pollYTDiscoveryAction` every
 * few seconds. A typical run with 50 channels takes 1–3 minutes — well
 * past Render's ~100s proxy timeout, so we never wait synchronously.
 */
export async function startYTDiscoveryAction(
  input: StartInput
): Promise<StartYTDiscoveryResult> {
  await requireWorkspace();
  const keywords = parseKeywords(input.keywords ?? "");
  if (keywords.length === 0) {
    return { ok: false, error: "Enter at least one search keyword." };
  }
  const runInput: YTDiscoveryInput = {
    keywords,
    country: input.country && input.country !== "ANY" ? input.country : undefined,
    language: input.language && input.language !== "ANY" ? input.language : undefined,
    minSubscribers: input.minSubscribers ?? 0,
    maxSubscribers: input.maxSubscribers ?? 0,
    maxChannels: input.maxChannels ?? 50,
    creatorsOnly: input.creatorsOnly ?? true,
  };
  try {
    const handle = await startYTRun(runInput);
    return {
      ok: true,
      runId: handle.runId,
      datasetId: handle.datasetId,
      status: handle.status,
      actor: handle.actor,
    };
  } catch (err) {
    if (err instanceof ApifyYTNotConfiguredError) {
      return {
        ok: false,
        error:
          "Set APIFY_TOKEN (or APIFY_YT_TOKEN) in Render → Environment to enable YouTube discovery.",
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start YouTube discovery.",
    };
  }
}

export type PollYTDiscoveryResult =
  | { ok: true; status: string; statusMessage?: string; finished: false }
  | {
      ok: true;
      status: "SUCCEEDED";
      statusMessage?: string;
      finished: true;
      found: number;
      saved: number;
      filteredOut: number;
    }
  | { ok: false; status: string; error: string };

export async function pollYTDiscoveryAction(args: {
  runId: string;
  datasetId: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  maxChannels?: number;
  creatorsOnly?: boolean;
}): Promise<PollYTDiscoveryResult> {
  const { workspace } = await requireWorkspace();
  let status;
  try {
    status = await getYTRunStatus(args.runId);
  } catch (err) {
    return {
      ok: false,
      status: "UNKNOWN",
      error: err instanceof Error ? err.message : "Could not reach Apify.",
    };
  }

  if (!isTerminalYTStatus(status.status)) {
    return {
      ok: true,
      status: status.status,
      statusMessage: status.statusMessage,
      finished: false,
    };
  }
  if (status.status !== "SUCCEEDED") {
    return {
      ok: false,
      status: status.status,
      error:
        status.statusMessage ??
        `YouTube discovery ${status.status.toLowerCase()} on Apify.`,
    };
  }

  let rowsAll: YTCreatorRow[];
  let rowsFiltered: YTCreatorRow[];
  try {
    // Fetch twice (cheap — same dataset, no extra Apify cost): once with
    // filters applied to know what to save, once unfiltered for the
    // `found` total + `filteredOut` count.
    rowsAll = await fetchYTDataset(status.datasetId ?? args.datasetId, {
      creatorsOnly: false,
      maxChannels: 200,
    });
    rowsFiltered = await fetchYTDataset(status.datasetId ?? args.datasetId, {
      minSubscribers: args.minSubscribers,
      maxSubscribers: args.maxSubscribers,
      maxChannels: args.maxChannels,
      creatorsOnly: args.creatorsOnly ?? true,
    });
  } catch (err) {
    return {
      ok: false,
      status: "SUCCEEDED",
      error: err instanceof Error ? err.message : "Failed to fetch YouTube results.",
    };
  }

  let saved = 0;
  for (const r of rowsFiltered) {
    try {
      await prisma.yTCreator.upsert({
        where: {
          workspaceId_channelId: {
            workspaceId: workspace.id,
            channelId: r.channelId,
          },
        },
        create: {
          workspaceId: workspace.id,
          channelId: r.channelId,
          handle: r.handle,
          title: r.title,
          description: r.description || null,
          subscribers: r.subscribers,
          videoCount: r.videoCount,
          viewCount: r.viewCount ? BigInt(r.viewCount) : null,
          country: r.country,
          language: r.language,
          category: r.category,
          email: r.email,
          thumbnailUrl: r.thumbnailUrl,
          bannerUrl: r.bannerUrl,
          channelUrl: r.channelUrl,
          customUrl: r.customUrl,
          isVerified: r.isVerified,
          isCreator: r.isCreator,
          qualityScore: r.qualityScore,
          detectionNote: r.detectionNote || null,
          fit: r.qualityScore / 100,
        },
        update: {
          handle: r.handle ?? undefined,
          title: r.title,
          description: r.description || null,
          subscribers: r.subscribers,
          videoCount: r.videoCount ?? undefined,
          viewCount: r.viewCount ? BigInt(r.viewCount) : null,
          country: r.country,
          language: r.language,
          category: r.category,
          email: r.email,
          thumbnailUrl: r.thumbnailUrl,
          bannerUrl: r.bannerUrl,
          channelUrl: r.channelUrl,
          customUrl: r.customUrl,
          isVerified: r.isVerified,
          isCreator: r.isCreator,
          qualityScore: r.qualityScore,
          detectionNote: r.detectionNote || null,
          fit: r.qualityScore / 100,
        },
      });
      saved++;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // P2021 = table doesn't exist yet (migration not run). Skip silently.
      if (code !== "P2021") {
        console.warn("[yt-discovery] upsert failed", err);
      }
    }
  }

  revalidatePath("/agents/youtube");
  revalidatePath("/agents/youtube-creators");

  return {
    ok: true,
    status: "SUCCEEDED",
    statusMessage: status.statusMessage,
    finished: true,
    found: rowsAll.length,
    saved,
    filteredOut: Math.max(0, rowsAll.length - rowsFiltered.length),
  };
}

export async function recordYTContactAction(creatorId: string) {
  const { workspace } = await requireWorkspace();
  try {
    await prisma.yTCreator.updateMany({
      where: { id: creatorId, workspaceId: workspace.id },
      data: { lastContactAt: new Date() },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") return { ok: true as const };
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "update_failed",
    };
  }
  revalidatePath("/agents/youtube");
  return { ok: true as const };
}

export async function deleteYTCreatorAction(creatorId: string) {
  const { workspace } = await requireWorkspace();
  await prisma.yTCreator
    .deleteMany({ where: { id: creatorId, workspaceId: workspace.id } })
    .catch(() => null);
  revalidatePath("/agents/youtube");
  return { ok: true as const };
}

export async function clearYTCreatorsAction() {
  const { workspace } = await requireWorkspace();
  await prisma.yTCreator
    .deleteMany({ where: { workspaceId: workspace.id } })
    .catch(() => null);
  revalidatePath("/agents/youtube");
  return { ok: true as const };
}

// Silence the unused-but-exported error type lint without re-importing.
void ApifyYTError;

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  searchYTCreatorsBoth,
  YTApiError,
  YTApiNotConfiguredError,
  type YTDiscoveryInput,
  type YTCreatorRow,
} from "@/integrations/youtube-data-api";

type SearchInput = {
  /** Comma / newline separated keywords. */
  keywords: string;
  country?: string;
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  maxChannels?: number;
  creatorsOnly?: boolean;
};

type SavedCreator = {
  id: string;
  channelId: string;
  handle: string | null;
  title: string;
  description: string | null;
  subscribers: number;
  videoCount: number | null;
  /** bigint → string for safe serialisation. */
  viewCount: string | null;
  country: string | null;
  language: string | null;
  category: string | null;
  email: string | null;
  thumbnailUrl: string | null;
  channelUrl: string;
  isVerified: boolean;
  isCreator: boolean;
  qualityScore: number | null;
  detectionNote: string | null;
  lastContactAt: Date | null;
};

export type SearchYTResult =
  | {
      ok: true;
      found: number;
      saved: number;
      filteredOut: number;
      creators: SavedCreator[];
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
 * Synchronous YouTube creator search via Google's YT Data API v3.
 * Search + channel-enrichment normally takes 1-3 s so we run it inline
 * — no polling needed (unlike the IG flow). Persists results into the
 * `YTCreator` table and returns the saved rows for the UI to render
 * immediately.
 */
export async function searchYTCreatorsAction(
  input: SearchInput
): Promise<SearchYTResult> {
  const { workspace } = await requireWorkspace();
  const keywords = parseKeywords(input.keywords ?? "");
  if (keywords.length === 0) {
    return { ok: false, error: "Enter at least one search keyword." };
  }

  const apiInput: YTDiscoveryInput = {
    keywords,
    country: input.country && input.country !== "ANY" ? input.country : undefined,
    language: input.language && input.language !== "ANY" ? input.language : undefined,
    minSubscribers: input.minSubscribers ?? 0,
    maxSubscribers: input.maxSubscribers ?? 0,
    maxChannels: input.maxChannels ?? 50,
    creatorsOnly: input.creatorsOnly ?? true,
  };

  let rowsAll: YTCreatorRow[];
  let rowsFiltered: YTCreatorRow[];
  try {
    const both = await searchYTCreatorsBoth(apiInput);
    rowsAll = both.all;
    rowsFiltered = both.filtered;
  } catch (err) {
    if (err instanceof YTApiNotConfiguredError) {
      return {
        ok: false,
        error:
          "Set YOUTUBE_API_KEY in Render → Environment to enable YouTube creator search. Get a key at https://console.cloud.google.com/apis/credentials after enabling 'YouTube Data API v3'.",
      };
    }
    if (err instanceof YTApiError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "YouTube search failed.",
    };
  }

  const saved: SavedCreator[] = [];
  for (const r of rowsFiltered) {
    try {
      const row = await prisma.yTCreator.upsert({
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
      saved.push({
        id: row.id,
        channelId: row.channelId,
        handle: row.handle,
        title: row.title,
        description: row.description,
        subscribers: row.subscribers,
        videoCount: row.videoCount,
        viewCount: row.viewCount !== null ? row.viewCount.toString() : null,
        country: row.country,
        language: row.language,
        category: row.category,
        email: row.email,
        thumbnailUrl: row.thumbnailUrl,
        channelUrl: row.channelUrl,
        isVerified: row.isVerified,
        isCreator: row.isCreator,
        qualityScore: row.qualityScore,
        detectionNote: row.detectionNote,
        lastContactAt: row.lastContactAt,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "P2021") {
        // YTCreator table doesn't exist yet (migration not run on Render).
        // Surface the API rows ephemerally so the user still sees results —
        // they just won't persist.
        saved.push({
          id: r.channelId,
          channelId: r.channelId,
          handle: r.handle,
          title: r.title,
          description: r.description || null,
          subscribers: r.subscribers,
          videoCount: r.videoCount,
          viewCount: r.viewCount,
          country: r.country,
          language: r.language,
          category: r.category,
          email: r.email,
          thumbnailUrl: r.thumbnailUrl,
          channelUrl: r.channelUrl,
          isVerified: r.isVerified,
          isCreator: r.isCreator,
          qualityScore: r.qualityScore,
          detectionNote: r.detectionNote,
          lastContactAt: null,
        });
        continue;
      }
      console.warn("[yt-search] upsert failed", err);
    }
  }

  revalidatePath("/agents/youtube");
  revalidatePath("/agents/youtube-creators");

  return {
    ok: true,
    found: rowsAll.length,
    saved: saved.length,
    filteredOut: Math.max(0, rowsAll.length - rowsFiltered.length),
    creators: saved,
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

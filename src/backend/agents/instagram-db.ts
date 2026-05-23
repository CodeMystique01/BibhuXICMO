import { prisma } from "@/backend/db";

/** Persist a discovered IG post; tolerates missing IGThread table (pre-migration). */
export async function upsertIGThread(data: {
  workspaceId: string;
  externalId: string;
  authorHandle: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string;
  likes: number;
  comments: number;
  relevance: number;
}) {
  try {
    await prisma.iGThread.upsert({
      where: {
        workspaceId_externalId: {
          workspaceId: data.workspaceId,
          externalId: data.externalId,
        },
      },
      create: data,
      update: {
        likes: data.likes,
        comments: data.comments,
        relevance: data.relevance,
        caption: data.caption,
        mediaUrl: data.mediaUrl,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[ig] IGThread table missing — run prisma db push / migrate");
      return;
    }
    throw err;
  }
}

/** Persist a discovered creator; tolerates missing IGCreator table. */
export async function upsertIGCreator(data: {
  workspaceId: string;
  handle: string;
  fullName: string | null;
  bio: string | null;
  followers: number;
  engagementRate: number | null;
  niche: string | null;
  profileUrl: string;
  fit: number;
  notes?: string | null;
}) {
  try {
    return await prisma.iGCreator.upsert({
      where: {
        workspaceId_handle: {
          workspaceId: data.workspaceId,
          handle: data.handle,
        },
      },
      create: data,
      update: {
        followers: data.followers,
        engagementRate: data.engagementRate ?? undefined,
        niche: data.niche ?? undefined,
        fit: data.fit,
        notes: data.notes ?? undefined,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[ig] IGCreator table missing — run prisma db push / migrate");
      return null;
    }
    throw err;
  }
}

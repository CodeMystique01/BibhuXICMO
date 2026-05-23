import { prisma } from "@/backend/db";

/** Persist discovered thread; skips if HNThread table is missing (migration not applied yet). */
export async function upsertHNThread(data: {
  workspaceId: string;
  externalId: string;
  title: string;
  itemUrl: string;
  storyUrl: string | null;
  points: number;
  comments: number;
  relevance: number;
}) {
  try {
    await prisma.hNThread.upsert({
      where: {
        workspaceId_externalId: {
          workspaceId: data.workspaceId,
          externalId: data.externalId,
        },
      },
      create: data,
      update: {
        points: data.points,
        comments: data.comments,
        relevance: data.relevance,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[hn] HNThread table missing — run prisma db push / migrate");
      return;
    }
    throw err;
  }
}

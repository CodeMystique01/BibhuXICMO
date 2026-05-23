import { prisma } from "@/backend/db";

/** Persist a discovered tweet; tolerates missing XThread table (pre-migration). */
export async function upsertXThread(data: {
  workspaceId: string;
  externalId: string;
  authorHandle: string;
  text: string;
  url: string;
  likes: number;
  retweets: number;
  replies: number;
  relevance: number;
}) {
  try {
    await prisma.xThread.upsert({
      where: {
        workspaceId_externalId: {
          workspaceId: data.workspaceId,
          externalId: data.externalId,
        },
      },
      create: data,
      update: {
        likes: data.likes,
        retweets: data.retweets,
        replies: data.replies,
        relevance: data.relevance,
        text: data.text,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[x] XThread table missing — run prisma db push / migrate");
      return;
    }
    throw err;
  }
}

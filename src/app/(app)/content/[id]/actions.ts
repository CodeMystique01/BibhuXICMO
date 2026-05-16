"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { ContentStatus } from "@prisma/client";

export async function updateDraftStatus(id: string, status: ContentStatus) {
  const { workspace } = await requireWorkspace();
  await prisma.contentDraft.updateMany({
    where: { id, workspaceId: workspace.id },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });
  revalidatePath(`/content/${id}`);
  revalidatePath("/content");
  return { ok: true as const };
}

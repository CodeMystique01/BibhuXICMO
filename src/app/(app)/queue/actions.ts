"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { publishDraft } from "@/backend/publish";
import { prisma } from "@/backend/db";

export async function publishDraftAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const result = await publishDraft(workspace.id, draftId);
  revalidatePath("/queue");
  revalidatePath(`/content/${draftId}`);
  return result;
}

export async function rejectDraftAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  await prisma.contentDraft.updateMany({
    where: { id: draftId, workspaceId: workspace.id },
    data: { status: "REJECTED" },
  });
  revalidatePath("/queue");
  return { ok: true as const };
}

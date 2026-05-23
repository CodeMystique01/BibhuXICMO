"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { regenerateXDraft, scheduleXAtPeak } from "@/backend/x-draft";

export async function regenerateXDraftAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await regenerateXDraft(workspace.id, draftId);
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/agents/x");
  return res;
}

export async function scheduleXPeakAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await scheduleXAtPeak(workspace.id, draftId);
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/queue");
  revalidatePath("/agents/x");
  return res;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { regenerateIGDraft, scheduleIGAtPeak } from "@/backend/instagram-draft";

export async function regenerateIGDraftAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await regenerateIGDraft(workspace.id, draftId);
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/agents/instagram");
  return res;
}

export async function scheduleIGPeakAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await scheduleIGAtPeak(workspace.id, draftId);
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/queue");
  revalidatePath("/agents/instagram");
  return res;
}

"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { regenerateHNDraft, scheduleHNDraftAtPeak } from "@/backend/hn-draft";

export async function regenerateHNTitleAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await regenerateHNDraft(workspace.id, draftId, "title");
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/agents/hn");
  return res;
}

export async function regenerateHNBodyAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await regenerateHNDraft(workspace.id, draftId, "body");
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/agents/hn");
  return res;
}

export async function regenerateHNFullAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await regenerateHNDraft(workspace.id, draftId, "full");
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/agents/hn");
  return res;
}

export async function scheduleHNPeakAction(draftId: string) {
  const { workspace } = await requireWorkspace();
  const res = await scheduleHNDraftAtPeak(workspace.id, draftId);
  revalidatePath(`/content/${draftId}`);
  revalidatePath("/queue");
  revalidatePath("/agents/hn");
  return res;
}

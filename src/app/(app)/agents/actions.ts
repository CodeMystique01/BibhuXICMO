"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { executeAgent } from "@/backend/agents/base";
import { getAgent } from "@/backend/agents/registry";

export async function runAgentAction(agentId: string, input?: unknown) {
  const { workspace } = await requireWorkspace();
  const agent = getAgent(agentId);
  if (!agent) return { ok: false as const, error: `Unknown agent: ${agentId}` };

  const result = await executeAgent(agent, workspace.id, input ?? {});
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/dashboard");
  revalidatePath("/actions");
  return result;
}

export async function resolveActionItem(actionId: string, status: "DONE" | "DISMISSED" | "SNOOZED") {
  const { workspace } = await requireWorkspace();
  const { prisma } = await import("@/backend/db");
  await prisma.actionItem.updateMany({
    where: { id: actionId, workspaceId: workspace.id },
    data: { status },
  });
  revalidatePath("/dashboard");
  revalidatePath("/actions");
  return { ok: true as const };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { executeAgent } from "@/backend/agents/base";
import { getAgent } from "@/backend/agents/registry";

const AGENT_TIMEOUT_MS = 110_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${Math.round(ms / 1000)}s. Try again or check Render logs.`
          )
        ),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function runAgentAction(agentId: string, input?: unknown) {
  const { workspace } = await requireWorkspace();
  const agent = getAgent(agentId);
  if (!agent) return { ok: false as const, error: `Unknown agent: ${agentId}` };

  try {
    const result = await withTimeout(
      executeAgent(agent, workspace.id, input ?? {}),
      agentId === "hn" || agentId === "x" || agentId === "instagram"
        ? 170_000
        : 60_000,
      agent.title
    );
    revalidatePath(`/agents/${agentId}`);
    revalidatePath("/dashboard");
    revalidatePath("/actions");
    revalidatePath("/content");
    revalidatePath("/queue");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message, runId: "" };
  }
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

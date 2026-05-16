import { prisma } from "@/backend/db";
import { assertHasCredits, CreditError } from "@/backend/credits";
import type { SupportedModel } from "@/backend/llm";

export type AgentContext = {
  workspaceId: string;
  websiteUrl: string | null;
  industry: string | null;
  icp: string | null;
  voiceProfile: unknown;
  /** When set (e.g. AI CMO dock tools), `pickAvailableModel` starts here before global fallbacks. */
  preferredModel?: SupportedModel;
};

export interface Agent<TInput = unknown, TOutput = unknown> {
  id: string;
  title: string;
  /** Optional cron expression for scheduled runs (set up by Phase 8 workers). */
  schedule?: string;
  /** Minimum credit balance required to run. */
  minCredits?: number;
  run(ctx: AgentContext, input: TInput): Promise<TOutput>;
}

export type AgentRunResult<T> = {
  runId: string;
  ok: boolean;
  output?: T;
  error?: string;
};

export async function executeAgent<T>(
  agent: Agent<unknown, T>,
  workspaceId: string,
  input: unknown,
  opts?: { preferredModel?: SupportedModel }
): Promise<AgentRunResult<T>> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) throw new Error("Workspace not found");

  const ctx: AgentContext = {
    workspaceId,
    websiteUrl: workspace.websiteUrl,
    industry: workspace.industry,
    icp: workspace.icp,
    voiceProfile: workspace.voiceProfile,
    preferredModel: opts?.preferredModel,
  };

  if (agent.minCredits) {
    try {
      await assertHasCredits(workspaceId, agent.minCredits);
    } catch (err) {
      if (err instanceof CreditError) {
        return { runId: "", ok: false, error: err.message };
      }
      throw err;
    }
  }

  const beforeBalance = await prisma.creditLedger
    .findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } })
    .then((r) => r?.balance ?? 0);

  const run = await prisma.agentRun.create({
    data: {
      workspaceId,
      agent: agent.id,
      status: "RUNNING",
      input: input ? JSON.parse(JSON.stringify(input)) : undefined,
    },
  });

  try {
    const output = await agent.run(ctx, input);

    const afterBalance = await prisma.creditLedger
      .findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } })
      .then((r) => r?.balance ?? 0);
    const creditsUsed = Math.max(0, beforeBalance - afterBalance);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        output: output ? JSON.parse(JSON.stringify(output)) : undefined,
        creditsUsed,
        finishedAt: new Date(),
      },
    });

    return { runId: run.id, ok: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: message,
        finishedAt: new Date(),
      },
    });
    return { runId: run.id, ok: false, error: message };
  }
}

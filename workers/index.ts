import "dotenv/config";
import { Worker } from "bullmq";
import cron from "node-cron";
import {
  agentQueueName,
  emailQueueName,
  publishQueueName,
  getRedisConnection,
  type AgentJob,
  type EmailJob,
  type PublishJob,
  emailQueue,
  enqueueAgentRun,
} from "@/backend/jobs/queue";
import { executeAgent } from "@/backend/agents/base";
import { getAgent, listAgents } from "@/backend/agents/registry";
import { publishDraft } from "@/backend/publish";
import { prisma } from "@/backend/db";
import { sendEmail, renderDigestEmail } from "@/backend/email";
import { env } from "@/shared/env";
import { SITE_NAME } from "@/shared/site";

const connection = getRedisConnection();

// -----------------------------------------------------------------
// Agent worker
// -----------------------------------------------------------------
const agentWorker = new Worker<AgentJob>(
  agentQueueName,
  async (job) => {
    const { agentId, workspaceId, input } = job.data;
    const agent = getAgent(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    const result = await executeAgent(agent, workspaceId, input ?? {});
    if (!result.ok) throw new Error(result.error || "Agent run failed");
    return result;
  },
  { connection, concurrency: 3 }
);
agentWorker.on("completed", (job) =>
  console.log(`[worker] ${job.data.agentId} completed for ${job.data.workspaceId}`)
);
agentWorker.on("failed", (job, err) =>
  console.warn(`[worker] ${job?.data.agentId} failed: ${err.message}`)
);

// -----------------------------------------------------------------
// Publish worker
// -----------------------------------------------------------------
const publishWorker = new Worker<PublishJob>(
  publishQueueName,
  async (job) => {
    const res = await publishDraft(job.data.workspaceId, job.data.draftId);
    if (!res.ok) throw new Error(res.error);
    return res;
  },
  { connection, concurrency: 2 }
);

// -----------------------------------------------------------------
// Email worker
// -----------------------------------------------------------------
const emailWorker = new Worker<EmailJob>(
  emailQueueName,
  async (job) => {
    await sendEmail(job.data);
  },
  { connection, concurrency: 5 }
);

// -----------------------------------------------------------------
// Cron scheduler
// -----------------------------------------------------------------
// Fan-out scheduled agents to every workspace on their configured cron.
for (const agent of listAgents()) {
  if (!agent.schedule) continue;
  try {
    cron.schedule(agent.schedule, async () => {
      console.log(`[cron] fan-out agent:${agent.id}`);
      const workspaces = await prisma.workspace.findMany({
        where: { websiteUrl: { not: null } },
        select: { id: true },
      });
      for (const ws of workspaces) {
        await enqueueAgentRun(agent.id, ws.id);
      }
    });
    console.log(`[cron] registered ${agent.id} @ ${agent.schedule}`);
  } catch (err) {
    console.warn(`[cron] invalid schedule for ${agent.id}: ${agent.schedule}`, err);
  }
}

// Daily email digest — 7:00 UTC
cron.schedule("0 7 * * *", async () => {
  console.log("[cron] daily email digest");
  const workspaces = await prisma.workspace.findMany({
    include: {
      owner: true,
    },
  });
  for (const ws of workspaces) {
    if (!ws.owner.email) continue;
    const [open, geo, audit] = await Promise.all([
      prisma.actionItem.findMany({
        where: { workspaceId: ws.id, status: "OPEN" },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
      prisma.geoScoreSnapshot.findFirst({
        where: { workspaceId: ws.id },
        orderBy: { date: "desc" },
      }),
      prisma.siteAudit.findFirst({
        where: { workspaceId: ws.id },
        orderBy: { ranAt: "desc" },
      }),
    ]);
    if (open.length === 0) continue;

    const html = renderDigestEmail({
      workspaceName: ws.name,
      actionItems: open.map((a) => ({
        title: a.title,
        summary: a.summary,
        href: a.href,
      })),
      geoScore: geo?.score ?? null,
      seoScore: audit?.score ?? null,
      appUrl: env.APP_URL,
    });

    await emailQueue().add(`digest:${ws.id}`, {
      to: ws.owner.email,
      subject: `${SITE_NAME} · ${open.length} action items for today`,
      html,
    });
  }
});

console.log("[worker] started. queues: agent, publish, email");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM — closing…");
  await Promise.all([
    agentWorker.close(),
    publishWorker.close(),
    emailWorker.close(),
  ]);
  process.exit(0);
});

import { Hash } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";
import { XComposer } from "./composer";

export const metadata = { title: "X Agent" };

export default async function XAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, integration] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "x" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "x" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: workspace.id, provider: "TWITTER" } },
    }),
  ]);

  return (
    <GenericAgentPage
      title="X / Twitter Agent"
      description="Drafts posts and threads in your voice. You approve, then we post."
      icon={Hash}
      agentId="x"
      drafts={drafts}
      runs={runs}
      connected={!!integration}
      connectSlug="twitter"
      extras={<XComposer />}
    />
  );
}

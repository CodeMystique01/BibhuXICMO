import { Newspaper } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";

export const metadata = { title: "Hacker News Agent" };

export default async function HNAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "hn" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "hn" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <GenericAgentPage
      title="Hacker News Agent"
      description="Finds relevant HN stories and drafts thoughtful comments for you to post manually."
      icon={Newspaper}
      agentId="hn"
      runButton={{ label: "Scan HN" }}
      drafts={drafts}
      runs={runs}
      connected={true}
    />
  );
}

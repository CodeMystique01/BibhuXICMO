import { Linkedin } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";
import { LinkedInComposer } from "./composer";

export const metadata = { title: "LinkedIn Agent" };

export default async function LinkedInAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, integration] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: workspace.id, provider: "LINKEDIN" } },
    }),
  ]);

  return (
    <GenericAgentPage
      title="LinkedIn Agent"
      description="Drafts long-form professional posts in your brand voice. You publish."
      icon={Linkedin}
      agentId="linkedin"
      drafts={drafts}
      runs={runs}
      connected={!!integration}
      connectSlug="linkedin"
      extras={<LinkedInComposer />}
    />
  );
}

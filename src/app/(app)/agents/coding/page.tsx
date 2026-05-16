import { Code2 } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";

export const metadata = { title: "Coding Agent" };

export default async function CodingAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, integration] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "coding" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "coding" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: workspace.id, provider: "GITHUB" } },
    }),
  ]);

  return (
    <GenericAgentPage
      title="Coding Agent"
      description="Opens GitHub pull requests for technical SEO fixes: schema, sitemap, robots, meta tags."
      icon={Code2}
      agentId="coding"
      drafts={drafts}
      runs={runs}
      connected={!!integration}
      connectSlug="github"
      emptyState="Connect GitHub and run an SEO audit first — we'll open PRs for the flagged issues."
    />
  );
}

import { MessageCircle } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";

export const metadata = { title: "Reddit Agent" };

export default async function RedditAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, integration, threads] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "reddit" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "reddit" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: workspace.id, provider: "REDDIT" } },
    }),
    prisma.redditThread.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { relevance: "desc" },
      take: 10,
    }),
  ]);

  const extras =
    threads.length === 0 ? null : (
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-sm font-semibold">Top relevant threads</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {threads.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <a
                  href={t.permalink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate hover:text-primary"
                >
                  r/{t.subreddit} · {t.title}
                </a>
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round(t.relevance * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <GenericAgentPage
      title="Reddit Agent"
      description="Monitors subreddits, drafts community-native replies, posts after your approval."
      icon={MessageCircle}
      agentId="reddit"
      runButton={{ label: "Scan subreddits" }}
      drafts={drafts}
      runs={runs}
      connected={!!integration}
      connectSlug="reddit"
      extras={extras}
    />
  );
}

import { NextResponse } from "next/server";
import { auth } from "@/backend/auth";
import { prisma } from "@/backend/db";
import { getAgentMeta } from "@/shared/agent-meta";
import type { NotificationItem } from "@/frontend/components/app/notifications-drawer";

export const dynamic = "force-dynamic";

/**
 * Lightweight feed of recent agent runs + new action items, scoped to the
 * caller's first owned workspace. Driven by the topbar bell + drawer.
 *
 * Deliberately not cached aggressively — runs change every minute.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ items: [], unread: 0 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ items: [], unread: 0 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { ownerUserId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    return NextResponse.json({ items: [], unread: 0 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentRuns, recentActions] = await Promise.all([
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 15,
    }),
    prisma.actionItem.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const items: NotificationItem[] = [
    ...recentRuns.map((r) => {
      const meta = getAgentMeta(r.agent);
      const label = meta?.label ?? r.agent;
      const isFailed = r.status === "FAILED";
      return {
        id: `run-${r.id}`,
        kind: isFailed ? ("agent.failed" as const) : ("agent.success" as const),
        title: isFailed
          ? `${label} agent run failed`
          : `${label} agent run finished`,
        description: isFailed
          ? r.error || "See run details for the failure reason."
          : `${r.creditsUsed} credits used`,
        href: meta?.href,
        createdAt: r.startedAt.toISOString(),
      };
    }),
    ...recentActions.map((a) => ({
      id: `action-${a.id}`,
      kind: "action.new" as const,
      title: a.title,
      description: a.summary ?? undefined,
      href: a.href ?? "/actions",
      createdAt: a.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 30);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const unread = items.filter(
    (n) => new Date(n.createdAt).getTime() > dayAgo
  ).length;

  return NextResponse.json({ items, unread });
}

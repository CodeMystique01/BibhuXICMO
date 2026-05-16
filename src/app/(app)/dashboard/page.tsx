import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { DashboardOverview } from "@/frontend/components/app/dashboard-overview";
import type { ChecklistItem } from "@/frontend/components/app/onboarding-checklist";
import { listAgentMeta } from "@/shared/agent-meta";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { workspace } = await requireWorkspace();

  // Single parallel batch — every page load was paying 9 sequential DB
  // round-trips before; now they all overlap, so the dashboard is paint-ready
  // in roughly the time of the slowest single query.
  const [
    actionCount,
    draftCount,
    latestGeo,
    latestAudit,
    recentRuns,
    integrations,
    chatCount,
    allRunsForLastBy,
    recentActions,
    resolvedActionCount,
  ] = await Promise.all([
    prisma.actionItem.count({
      where: { workspaceId: workspace.id, status: "OPEN" },
    }),
    prisma.contentDraft.count({
      where: {
        workspaceId: workspace.id,
        status: { in: ["DRAFT", "PENDING_APPROVAL"] },
      },
    }),
    prisma.geoScoreSnapshot.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { date: "desc" },
      select: { score: true },
    }),
    prisma.siteAudit.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { ranAt: "desc" },
      select: { score: true },
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { startedAt: "desc" },
      take: 6,
      select: {
        id: true,
        agent: true,
        status: true,
        startedAt: true,
        creditsUsed: true,
      },
    }),
    prisma.integration.findMany({
      where: { workspaceId: workspace.id },
      select: { provider: true },
    }),
    prisma.chatSession.count({ where: { workspaceId: workspace.id } }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { startedAt: "desc" },
      distinct: ["agent"],
      take: 20,
      select: { agent: true, startedAt: true, status: true },
    }),
    prisma.actionItem.findMany({
      where: { workspaceId: workspace.id, status: "OPEN" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        summary: true,
        priority: true,
        agent: true,
        cta: true,
        href: true,
      },
    }),
    prisma.actionItem.count({
      where: {
        workspaceId: workspace.id,
        status: { in: ["DONE", "DISMISSED"] },
      },
    }),
  ]);

  // Build the dashboard onboarding checklist.
  const providers = new Set(integrations.map((i) => i.provider));
  const hasAnySearchData =
    providers.has("GOOGLE_SEARCH_CONSOLE") || providers.has("GOOGLE_ANALYTICS");
  const checklist: ChecklistItem[] = [
    {
      id: "site",
      label: "Add your website URL",
      cta: "Add now",
      href: "/onboarding",
      done: !!workspace.websiteUrl,
    },
    {
      id: "first-audit",
      label: "Run your first SEO audit",
      cta: "Run audit",
      href: "/agents/seo",
      done: !!latestAudit,
    },
    {
      id: "analytics",
      label: "Connect Search Console or Analytics",
      cta: "Connect",
      href: "/integrations",
      done: hasAnySearchData,
    },
    {
      id: "first-chat",
      label: "Try the private chat workbench",
      cta: "Open chat",
      href: "/chat",
      done: chatCount > 0,
    },
    {
      id: "first-action",
      label: "Resolve your first action item",
      cta: "Open actions",
      href: "/actions",
      done: actionCount === 0 && resolvedActionCount > 0,
    },
  ];

  // Latest run per agent → for the AgentQuickGrid.
  const lastRunByAgent: Record<
    string,
    { startedAt: string; status: string } | undefined
  > = {};
  for (const a of listAgentMeta()) {
    const r = allRunsForLastBy.find((x) => x.agent === a.id);
    lastRunByAgent[a.id] = r
      ? { startedAt: r.startedAt.toISOString(), status: r.status }
      : undefined;
  }

  return (
    <DashboardOverview
      workspace={{
        name: workspace.name,
        websiteUrl: workspace.websiteUrl,
        industry: workspace.industry,
      }}
      metrics={{
        actionCount,
        draftCount,
        geoScore: latestGeo?.score ?? null,
        seoScore: latestAudit?.score ?? null,
      }}
      recentActions={recentActions.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        priority: a.priority,
        agent: a.agent,
        cta: a.cta,
        href: a.href,
      }))}
      recentRuns={recentRuns.map((r) => ({
        id: r.id,
        agent: r.agent,
        status: r.status,
        startedAt: r.startedAt,
        creditsUsed: r.creditsUsed,
      }))}
      checklist={checklist}
      agentLastRuns={lastRunByAgent}
    />
  );
}


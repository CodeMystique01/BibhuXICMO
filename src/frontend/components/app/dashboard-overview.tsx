import Link from "next/link";
import { format } from "date-fns";
import {
  Bot,
  ArrowRight,
  Activity,
  Pencil,
  Sparkles,
  FileText,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { OnboardingChecklist } from "./onboarding-checklist";
import { AgentQuickGrid } from "./agent-quick-grid";
import type { ChecklistItem } from "./onboarding-checklist";

export function DashboardOverview({
  workspace,
  metrics,
  recentActions,
  recentRuns,
  checklist,
  agentLastRuns,
}: {
  workspace: { name: string; websiteUrl: string | null; industry: string | null };
  metrics: {
    actionCount: number;
    draftCount: number;
    geoScore: number | null;
    seoScore: number | null;
  };
  recentActions: Array<{
    id: string;
    title: string;
    summary: string | null;
    priority: string;
    agent: string;
    cta: string | null;
    href: string | null;
  }>;
  recentRuns: Array<{
    id: string;
    agent: string;
    status: string;
    startedAt: Date;
    creditsUsed: number;
  }>;
  checklist: ChecklistItem[];
  agentLastRuns: Record<string, { startedAt: string; status: string } | undefined>;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {workspace.websiteUrl ? (
              <>
                Monitoring{" "}
                <span className="font-medium text-foreground">
                  {workspace.websiteUrl.replace(/^https?:\/\//, "")}
                </span>
                <Link
                  href="/settings#websiteUrl"
                  prefetch
                  className="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
                  title="Change website URL"
                >
                  <Pencil className="h-3 w-3" />
                  change
                </Link>
                {workspace.industry && ` · ${workspace.industry}`}
              </>
            ) : (
              <>
                Add your website to start producing action items.{" "}
                <Link
                  href="/settings#websiteUrl"
                  prefetch
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Add website
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/integrations">Connect integrations</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/agents/seo">Run SEO audit</Link>
          </Button>
        </div>
      </div>

      <OnboardingChecklist items={checklist} />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="Open action items"
          value={metrics.actionCount}
        />
        <StatCard
          icon={FileText}
          label="Pending drafts"
          value={metrics.draftCount}
        />
        <StatCard
          icon={TrendingUp}
          label="SEO score"
          value={metrics.seoScore != null ? `${metrics.seoScore}/100` : "—"}
        />
        <StatCard
          icon={Bot}
          label="GEO score"
          value={metrics.geoScore != null ? `${metrics.geoScore}/100` : "—"}
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Run an agent</h2>
            <p className="text-xs text-muted-foreground">
              Each card shows roughly how many credits a run will burn.
            </p>
          </div>
        </div>
        <AgentQuickGrid lastRuns={agentLastRuns} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Action Items
              </CardTitle>
              <CardDescription>
                Reviewable marketing actions, ranked by priority.
              </CardDescription>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/actions">
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentActions.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No open action items"
                description="Run any agent above and we'll seed your queue with concrete next steps."
                primaryAction={{ label: "Run SEO audit", href: "/agents/seo" }}
                secondaryAction={{
                  label: "Connect Search Console",
                  href: "/integrations/gsc",
                }}
              />
            ) : (
              <ul className="divide-y">
                {recentActions.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PriorityDot p={a.priority} />
                        <Badge variant="outline" className="text-[10px]">
                          {a.agent}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {a.title}
                        </span>
                      </div>
                      {a.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {a.summary}
                        </p>
                      )}
                    </div>
                    {a.href && (
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={a.href}>
                          {a.cta || "Open"}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent agent runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentRuns.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-medium capitalize">{r.agent}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(r.startedAt, "MMM d · HH:mm")}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          r.status === "SUCCESS"
                            ? "success"
                            : r.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status.toLowerCase()}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {r.creditsUsed} credits
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityDot({ p }: { p: string }) {
  const color =
    p === "URGENT"
      ? "bg-red-500"
      : p === "HIGH"
        ? "bg-orange-500"
        : p === "MEDIUM"
          ? "bg-amber-500"
          : "bg-slate-400";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

import { format } from "date-fns";
import { Sparkles, Check, X } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { RunAgentButton } from "@/frontend/components/app/run-agent-button";

export const metadata = { title: "GEO Agent" };

export default async function GeoAgentPage() {
  const { workspace } = await requireWorkspace();

  const [snapshots, recentProbes] = await Promise.all([
    prisma.geoScoreSnapshot.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { date: "desc" },
      take: 12,
    }),
    prisma.geoQuery.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { checkedAt: "desc" },
      take: 25,
    }),
  ]);

  const latest = snapshots[0];
  const prev = snapshots[1];
  const delta = latest && prev ? latest.score - prev.score : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">GEO Agent</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Measures how often ChatGPT, Claude, and Perplexity cite your brand.
          </p>
        </div>
        <RunAgentButton agentId="geo" label="Run GEO check" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-xs text-muted-foreground">Current GEO score</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold">{latest?.score ?? "—"}</span>
              {delta !== 0 && (
                <span
                  className={
                    delta > 0
                      ? "text-sm text-emerald-600 dark:text-emerald-400"
                      : "text-sm text-destructive"
                  }
                >
                  {delta > 0 ? "+" : ""}
                  {delta} vs last
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {latest ? format(latest.date, "MMM d, yyyy") : "Run a check to populate"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-xs text-muted-foreground">Probes this run</div>
            <div className="mt-2 text-4xl font-bold">
              {recentProbes.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Across OpenAI and Anthropic
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-xs text-muted-foreground">Cited rate</div>
            <div className="mt-2 text-4xl font-bold">
              {recentProbes.length > 0
                ? `${Math.round(
                    (recentProbes.filter((p) => p.cited).length /
                      recentProbes.length) *
                      100
                  )}%`
                : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Latest {recentProbes.length} probes
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent probes</CardTitle>
          <CardDescription>
            Every prompt, every provider, with whether your brand was cited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentProbes.length === 0 ? (
            <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No probes yet. Click &quot;Run GEO check&quot; to measure your AI
              search visibility.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentProbes.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.provider}
                        </Badge>
                        <span className="font-medium">{p.prompt}</span>
                      </div>
                      {p.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {p.snippet}
                        </p>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {format(p.checkedAt, "MMM d · HH:mm")}
                      </div>
                    </div>
                    {p.cited ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" />
                        cited
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <X className="h-3 w-3" />
                        not cited
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

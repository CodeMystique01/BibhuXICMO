import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { RunAgentButton } from "@/frontend/components/app/run-agent-button";

export const metadata = { title: "SEO Agent" };

type Issue = {
  severity: "low" | "medium" | "high";
  category: string;
  title: string;
  fix: string;
  url?: string;
};

export default async function SeoAgentPage() {
  const { workspace } = await requireWorkspace();

  const [latestAudit, keywords, runs] = await Promise.all([
    prisma.siteAudit.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { ranAt: "desc" },
    }),
    prisma.keyword.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { trackedSince: "desc" },
      take: 20,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "seo" },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  const issues = (latestAudit?.issues as Issue[] | null) ?? [];
  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;
  const low = issues.filter((i) => i.severity === "low").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">SEO Agent</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily site audit, keyword opportunities, and ranking tracking.
          </p>
        </div>
        <RunAgentButton agentId="seo" label="Run audit now" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">SEO score</div>
            <div className="mt-1 text-3xl font-semibold">
              {latestAudit ? `${latestAudit.score}` : "—"}
              {latestAudit && <span className="text-base text-muted-foreground">/100</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">High severity</div>
            <div className="mt-1 text-3xl font-semibold text-destructive">{high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Medium</div>
            <div className="mt-1 text-3xl font-semibold text-amber-500">{medium}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Low</div>
            <div className="mt-1 text-3xl font-semibold text-muted-foreground">{low}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latest audit findings</CardTitle>
            <CardDescription>
              {latestAudit
                ? `Audited ${format(latestAudit.ranAt, "MMM d, yyyy · HH:mm")}`
                : "Run your first audit to see findings here."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                Click &quot;Run audit now&quot; to analyze your site.
              </p>
            ) : (
              <ul className="space-y-3">
                {issues.slice(0, 10).map((issue, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <SeverityIcon sev={issue.severity} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {issue.category}
                          </Badge>
                          <span className="text-sm font-medium">{issue.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {issue.fix}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Keyword opportunities</CardTitle>
              <CardDescription>Tracked keywords from your audits.</CardDescription>
            </CardHeader>
            <CardContent>
              {keywords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No keywords tracked yet.</p>
              ) : (
                <ul className="divide-y">
                  {keywords.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-medium">{k.query}</span>
                      {k.intent && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {k.intent}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {runs.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between"
                    >
                      <span>{format(r.startedAt, "MMM d · HH:mm")}</span>
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
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SeverityIcon({ sev }: { sev: Issue["severity"] }) {
  if (sev === "high")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (sev === "medium")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

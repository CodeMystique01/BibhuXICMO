import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { listGSCSites, querySearchAnalytics } from "@/integrations/google";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";

export const metadata = { title: "Search Console" };

export default async function GscPage(props: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site: selectedSite } = await props.searchParams;
  const { workspace } = await requireWorkspace();
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId: workspace.id, provider: "GOOGLE_SEARCH_CONSOLE" } },
  });

  if (!integration) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold">Google Search Console</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Not connected</CardTitle>
            <CardDescription>
              Connect your Google Search Console account to unlock top queries,
              top pages, CTR, and position tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/api/integrations/gsc/start">Connect Search Console</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sites = await listGSCSites(workspace.id);
  const activeSite = selectedSite ?? sites[0]?.siteUrl;
  const queries = activeSite
    ? await querySearchAnalytics(workspace.id, activeSite, {
        dimensions: ["query"],
        rowLimit: 50,
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold">Google Search Console</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 30 days · {activeSite || "no site selected"}
        </p>
      </div>

      {sites.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <Link
              key={s.siteUrl}
              href={`/integrations/gsc?site=${encodeURIComponent(s.siteUrl)}`}
              className={`rounded-md border px-3 py-1 text-xs ${
                s.siteUrl === activeSite
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.siteUrl.replace(/^(sc-domain:|https?:\/\/)/, "")}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top queries</CardTitle>
          <CardDescription>By clicks, last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {queries.length === 0 ? (
            <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No data yet. Either Google has no recent impressions, or the
              connected account does not have access to this property.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left">Query</th>
                    <th className="py-2 text-right">Clicks</th>
                    <th className="py-2 text-right">Impressions</th>
                    <th className="py-2 text-right">CTR</th>
                    <th className="py-2 text-right">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.slice(0, 50).map((q, i) => {
                    const almostRanking = q.position > 10 && q.position <= 20;
                    return (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-2 font-medium">
                          <span className="flex items-center gap-2">
                            {q.keys[0]}
                            {almostRanking && (
                              <Badge variant="warning" className="text-[10px]">
                                almost ranking
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-2 text-right">{q.clicks}</td>
                        <td className="py-2 text-right">{q.impressions}</td>
                        <td className="py-2 text-right">
                          {(q.ctr * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right">
                          {q.position.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

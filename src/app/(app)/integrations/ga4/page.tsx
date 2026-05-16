import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { listGA4Properties, runGA4Report } from "@/integrations/google";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";

export const metadata = { title: "Google Analytics" };

export default async function Ga4Page(props: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property: selectedProp } = await props.searchParams;
  const { workspace } = await requireWorkspace();
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId: workspace.id, provider: "GOOGLE_ANALYTICS" } },
  });

  if (!integration) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold">Google Analytics</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Not connected</CardTitle>
            <CardDescription>
              Connect GA4 to see sessions, active users, and top pages for the
              last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/api/integrations/ga4/start">Connect GA4</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const properties = await listGA4Properties(workspace.id);
  const activeProp = selectedProp ?? properties[0]?.name;
  const rows = activeProp
    ? await runGA4Report(workspace.id, activeProp, {
        dimensions: ["pagePath"],
        metrics: ["sessions", "activeUsers", "conversions"],
        limit: 25,
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold">Google Analytics</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 30 days ·{" "}
          {properties.find((p) => p.name === activeProp)?.displayName ?? "no property"}
        </p>
      </div>

      {properties.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {properties.map((p) => (
            <Link
              key={p.name}
              href={`/integrations/ga4?property=${encodeURIComponent(p.name)}`}
              className={`rounded-md border px-3 py-1 text-xs ${
                p.name === activeProp
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.displayName}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top pages</CardTitle>
          <CardDescription>Ranked by sessions, last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No rows. Either the property has no traffic in the window, or
              the connected Google account doesn&apos;t have access.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left">Page path</th>
                    <th className="py-2 text-right">Sessions</th>
                    <th className="py-2 text-right">Users</th>
                    <th className="py-2 text-right">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2 font-mono text-xs">{r.dimensions[0]}</td>
                      <td className="py-2 text-right">{r.metrics[0]}</td>
                      <td className="py-2 text-right">{r.metrics[1]}</td>
                      <td className="py-2 text-right">{r.metrics[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

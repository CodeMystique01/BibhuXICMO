import { Sparkles } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { ActionItemRow } from "@/frontend/components/app/action-item-row";

export const metadata = { title: "Action Items" };

export default async function ActionsPage() {
  const { workspace } = await requireWorkspace();

  const [open, done] = await Promise.all([
    prisma.actionItem.findMany({
      where: { workspaceId: workspace.id, status: "OPEN" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    prisma.actionItem.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["DONE", "DISMISSED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Action Items</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Concrete next steps your agents have surfaced. Review, complete, or dismiss.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open — {open.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="You're all caught up"
              description="Run any agent and we'll surface new actions you can review, complete, or dismiss."
              primaryAction={{ label: "Run SEO agent", href: "/agents/seo" }}
              secondaryAction={{ label: "Open AI CMO", href: "/agent/cmo" }}
            />
          ) : (
            <ul className="divide-y">
              {open.map((a) => (
                <ActionItemRow
                  key={a.id}
                  item={{
                    id: a.id,
                    title: a.title,
                    summary: a.summary,
                    agent: a.agent,
                    priority: a.priority,
                    cta: a.cta,
                    href: a.href,
                    createdAt: a.createdAt,
                  }}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently closed</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {done.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {a.agent}
                      </Badge>
                      <span className="truncate text-muted-foreground line-through">
                        {a.title}
                      </span>
                    </div>
                  </div>
                  <Badge variant="secondary">{a.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

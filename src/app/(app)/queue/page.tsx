import Link from "next/link";
import { format } from "date-fns";
import { Layers } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { QueueActions } from "./actions-client";

export const metadata = { title: "Publish Queue" };

export default async function QueuePage() {
  const { workspace } = await requireWorkspace();

  const [pending, published, scheduled] = await Promise.all([
    prisma.contentDraft.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["DRAFT", "PENDING_APPROVAL"] },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 20,
    }),
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Publish Queue</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve, schedule, or publish drafts across every connected channel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting approval — {pending.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nothing in your approval queue"
              description="Drafts from the Content, X, and LinkedIn agents land here for one-click approval."
              primaryAction={{
                label: "Generate content",
                href: "/agents/content",
              }}
              secondaryAction={{
                label: "Open Content Library",
                href: "/content",
              }}
            />
          ) : (
            <ul className="divide-y">
              {pending.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {d.channel.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Link
                        href={`/content/${d.id}`}
                        className="truncate font-medium hover:text-primary"
                      >
                        {d.title || "Untitled"}
                      </Link>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {d.body.slice(0, 200)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(d.createdAt, "MMM d · HH:mm")} · {d.agent}
                    </p>
                  </div>
                  <QueueActions id={d.id} channel={d.channel} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {scheduled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {scheduled.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{d.title || "Untitled"}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.scheduledAt && format(d.scheduledAt, "MMM d · HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {published.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently published</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {published.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {d.channel.toLowerCase().replace("_", " ")}
                      </Badge>
                      <span className="truncate">{d.title || "Untitled"}</span>
                    </div>
                    {d.publishedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(d.publishedAt, "MMM d · HH:mm")}
                      </span>
                    )}
                  </div>
                  {d.externalUrl && (
                    <a
                      href={d.externalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      View ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

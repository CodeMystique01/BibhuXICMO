import Link from "next/link";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { EmptyState } from "@/frontend/components/ui/empty-state";

export const metadata = { title: "Content Library" };

export default async function ContentLibraryPage() {
  const { workspace } = await requireWorkspace();
  const drafts = await prisma.contentDraft.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">Content Library</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All drafts — {drafts.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No content drafts yet"
              description="Generate your first long-form post or social draft — agents save them here automatically."
              primaryAction={{
                label: "Open Content Writer",
                href: "/agents/content",
              }}
              secondaryAction={{
                label: "Try LinkedIn Agent",
                href: "/agents/linkedin",
              }}
            />
          ) : (
            <ul className="divide-y">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/content/${d.id}`}
                      className="truncate font-medium hover:text-primary"
                    >
                      {d.title || "Untitled"}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {d.channel.toLowerCase().replace("_", " ")}
                      </Badge>
                      <span>{format(d.createdAt, "MMM d · HH:mm")}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {d.status.toLowerCase().replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

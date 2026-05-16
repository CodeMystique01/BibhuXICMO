import Link from "next/link";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { ContentWriterForm } from "./form";

export const metadata = { title: "Content Writer" };

export default async function ContentAgentPage() {
  const { workspace } = await requireWorkspace();

  const drafts = await prisma.contentDraft.findMany({
    where: { workspaceId: workspace.id, agent: "content" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2">
        <FileText className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            AI Content Writer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate long-form drafts in your brand voice for any channel.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Write something</CardTitle>
            <CardDescription>
              Paste a topic or keyword — we&apos;ll produce a draft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContentWriterForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent drafts</CardTitle>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                No drafts yet. Ask the Content Writer to draft your first post.
              </p>
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
                        {d.title || "Untitled draft"}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {d.channel.toLowerCase().replace("_", " ")}
                        </Badge>
                        <span>{format(d.createdAt, "MMM d · HH:mm")}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {d.status.toLowerCase().replace("_", " ")}
                    </Badge>
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

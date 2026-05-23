import Link from "next/link";
import { format } from "date-fns";
import { Newspaper } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { HNRunButtons } from "@/frontend/components/app/hn-run-buttons";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { MIN_DISCOVERED_RELEVANCE } from "@/backend/agents/hn-keywords";
import { parseHnMeta, hnKindLabel } from "@/shared/hn";

export const metadata = { title: "Hacker News Agent" };

/** Allow long HN runs (multiple LLM calls) on serverless hosts. */
export const maxDuration = 180;

function isPostDraft(meta: unknown) {
  const k = parseHnMeta(meta)?.hnKind;
  return k === "show_hn" || k === "ask_hn";
}

function isCommentDraft(meta: unknown) {
  const k = parseHnMeta(meta)?.hnKind;
  if (k === "comment") return true;
  if (!k && meta && typeof meta === "object" && "storyId" in meta) return true;
  return false;
}

export default async function HNAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, threads] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "hn" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "hn" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.hNThread.findMany({
      where: {
        workspaceId: workspace.id,
        relevance: { gte: MIN_DISCOVERED_RELEVANCE },
      },
      orderBy: [{ relevance: "desc" }, { discoveredAt: "desc" }],
      take: 20,
    }),
  ]);

  const siteKey = (workspace.websiteUrl ?? "").replace(/\/$/, "").toLowerCase();

  const postDraftForSite = (meta: unknown) => {
    if (!isPostDraft(meta)) return false;
    const source = String((meta as Record<string, unknown>)?.sourceWebsiteUrl ?? "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (!source) return true;
    return source === siteKey;
  };

  const postDrafts = drafts.filter((d) => postDraftForSite(d.meta));
  const commentDrafts = drafts.filter((d) => isCommentDraft(d.meta));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">Hacker News Agent</h1>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Discovers relevant threads and drafts comments, plus daily Show HN and Ask HN
            posts. No HN API key required — you approve and submit on news.ycombinator.com.
          </p>
        </div>
        <HNRunButtons />
      </div>

      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts">Show / Ask HN ({postDrafts.length})</TabsTrigger>
          <TabsTrigger value="comments">Comments ({commentDrafts.length})</TabsTrigger>
          <TabsTrigger value="threads">Discovered ({threads.length})</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <DraftList
            drafts={postDrafts}
            empty="No Show HN or Ask HN drafts for your current website. Click Generate posts after saving Settings."
          />
        </TabsContent>

        <TabsContent value="comments">
          <DraftList
            drafts={commentDrafts}
            empty="No comment drafts yet. Click Scan threads to find relevant discussions."
          />
        </TabsContent>

        <TabsContent value="threads">
          <Card>
            <CardHeader>
              <CardTitle>Discovered stories</CardTitle>
              <CardDescription>
                Keyword matches for your brand (≥40% relevance), highest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {threads.length === 0 ? (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Run a thread scan to populate this list.
                </p>
              ) : (
                <ul className="divide-y">
                  {threads.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <a
                          href={t.itemUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm font-medium hover:text-primary"
                        >
                          {t.title}
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.points} pts · {t.comments} comments · relevance{" "}
                          {Math.round(t.relevance * 100)}%
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {runs.map((r) => {
                    const out = r.output as
                      | { surfaced?: number; generated?: number; message?: string }
                      | null;
                    return (
                      <li key={r.id} className="py-2">
                        <div className="flex justify-between gap-2">
                          <span className="capitalize">{r.status.toLowerCase()}</span>
                          <span className="text-muted-foreground">
                            {format(r.startedAt, "MMM d · HH:mm")} · {r.creditsUsed} credits
                          </span>
                        </div>
                        {r.status === "SUCCESS" && out && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {typeof out.surfaced === "number" && `Comments: ${out.surfaced} · `}
                            {typeof out.generated === "number" && `Posts: ${out.generated}`}
                            {out.message ? ` — ${out.message}` : null}
                          </p>
                        )}
                        {r.status === "FAILED" && r.error && (
                          <p className="mt-1 text-xs text-destructive">{r.error}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DraftList({
  drafts,
  empty,
}: {
  drafts: Array<{
    id: string;
    title: string | null;
    body: string;
    status: string;
    createdAt: Date;
    meta: unknown;
  }>;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drafts</CardTitle>
        <CardDescription>Awaiting your approval in the publish queue.</CardDescription>
      </CardHeader>
      <CardContent>
        {drafts.length === 0 ? (
          <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="divide-y">
            {drafts.map((d) => {
              const kind = parseHnMeta(d.meta)?.hnKind;
              return (
                <li key={d.id} className="py-3">
                  <Link href={`/content/${d.id}`} className="block hover:text-primary">
                    <div className="flex items-center gap-2">
                      {kind && (
                        <Badge variant="secondary" className="text-[10px]">
                          {hnKindLabel(kind)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {d.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {d.title || "Untitled"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {d.body.slice(0, 180)}
                    </p>
                    <span className="mt-1 text-[10px] text-muted-foreground">
                      {format(d.createdAt, "MMM d · HH:mm")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { format } from "date-fns";
import { Hash } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { XRunButtons } from "@/frontend/components/app/x-run-buttons";
import { XComposer } from "./composer";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/frontend/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { MIN_X_DISCOVERED_RELEVANCE } from "@/backend/agents/x-search";
import { invalidateStaleXDrafts, postDraftMatchesSite } from "@/backend/agents/x-stale";
import { parseXMeta, xKindLabel } from "@/shared/x";

export const metadata = { title: "X Agent" };

/** X agent does multiple LLM calls per run — allow extra serverless time. */
export const maxDuration = 180;

function isReplyDraft(meta: unknown) {
  return parseXMeta(meta)?.xKind === "reply";
}

export default async function XAgentPage() {
  const { workspace } = await requireWorkspace();
  await invalidateStaleXDrafts(workspace.id, workspace.websiteUrl);

  const [drafts, runs, integration, threads] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "x" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "x" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: {
        workspaceId_provider: { workspaceId: workspace.id, provider: "TWITTER" },
      },
    }),
    prisma.xThread
      .findMany({
        where: {
          workspaceId: workspace.id,
          relevance: { gte: MIN_X_DISCOVERED_RELEVANCE },
        },
        orderBy: [{ relevance: "desc" }, { discoveredAt: "desc" }],
        take: 20,
      })
      .catch(() => []),
  ]);

  const postDrafts = drafts.filter((d) =>
    postDraftMatchesSite(d.meta, workspace.websiteUrl)
  );
  const replyDrafts = drafts.filter((d) => isReplyDraft(d.meta));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">X / Twitter Agent</h1>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Daily tweet + thread drafts in your voice, and reply suggestions for
            buying-intent tweets. {integration ? "Connected — drafts publish in one click." : "Connect X to publish drafts directly; otherwise copy/paste from the draft page."}
          </p>
        </div>
        <XRunButtons />
      </div>

      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts">Posts ({postDrafts.length})</TabsTrigger>
          <TabsTrigger value="replies">Replies ({replyDrafts.length})</TabsTrigger>
          <TabsTrigger value="threads">Discovered ({threads.length})</TabsTrigger>
          <TabsTrigger value="composer">Composer</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <DraftList
            drafts={postDrafts}
            empty="No tweet or thread drafts for your current website. Click Generate posts after saving Settings."
          />
        </TabsContent>

        <TabsContent value="replies">
          <DraftList
            drafts={replyDrafts}
            empty="No reply drafts yet. Click Scan tweets to find buying-intent tweets to reply to."
          />
        </TabsContent>

        <TabsContent value="threads">
          <Card>
            <CardHeader>
              <CardTitle>Discovered tweets</CardTitle>
              <CardDescription>
                Tweets ranked by LLM relevance (≥
                {Math.round(MIN_X_DISCOVERED_RELEVANCE * 100)}%), highest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {threads.length === 0 ? (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Run a tweet scan to populate this list.
                </p>
              ) : (
                <ul className="divide-y">
                  {threads.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm font-medium hover:text-primary"
                        >
                          @{t.authorHandle}
                        </a>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {t.text}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.likes} likes · {t.retweets} RT · {t.replies} replies ·
                          relevance {Math.round(t.relevance * 100)}%
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="composer">
          <XComposer />
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
                      | {
                          drafts?: number;
                          surfaced?: number;
                          discovered?: number;
                          message?: string;
                        }
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
                            {typeof out.drafts === "number" && `Posts: ${out.drafts} · `}
                            {typeof out.surfaced === "number" && `Replies: ${out.surfaced}`}
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
              const kind = parseXMeta(d.meta)?.xKind;
              return (
                <li key={d.id} className="py-3">
                  <Link href={`/content/${d.id}`} className="block hover:text-primary">
                    <div className="flex items-center gap-2">
                      {kind && (
                        <Badge variant="secondary" className="text-[10px]">
                          {xKindLabel(kind)}
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

import Link from "next/link";
import { format } from "date-fns";
import { Instagram, Sparkles } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { env } from "@/shared/env";
import { InstagramRunButtons } from "@/frontend/components/app/instagram-run-buttons";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/frontend/components/ui/tabs";
import { MIN_IG_DISCOVERED_RELEVANCE } from "@/backend/agents/instagram-keywords";
import {
  igPostDraftMatchesSite,
  invalidateStaleIGDrafts,
} from "@/backend/agents/instagram-stale";
import { igKindLabel, parseIgMeta, type IGKind } from "@/shared/instagram";
import { hasIGCookies } from "@/backend/ig-cookies";
import { resolveIgBusinessAccount } from "@/integrations/instagram";
import { IGComposer } from "./composer";
import { IGCookiesModal } from "./ig-cookies-modal";
import { CampaignControls } from "./campaign-controls";
import { CampaignForm } from "./campaign-form";
import { InfluencerFind, type CreatorRow } from "./influencer-find";
import { NegotiateView, type NegCampaign } from "./negotiate-view";

export const metadata = { title: "Instagram Agent" };

/** Instagram agent does multiple LLM calls per run — extra serverless time. */
export const maxDuration = 180;

function getKind(meta: unknown): IGKind | null {
  return parseIgMeta(meta)?.igKind ?? null;
}

export default async function InstagramAgentPage() {
  const { workspace } = await requireWorkspace();
  await invalidateStaleIGDrafts(workspace.id, workspace.websiteUrl);

  const [
    drafts,
    runs,
    integration,
    igAccount,
    threads,
    creators,
    campaigns,
    cookiesOn,
  ] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "instagram" },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "instagram" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: workspace.id,
          provider: "INSTAGRAM",
        },
      },
    }),
    resolveIgBusinessAccount(workspace.id).catch(() => null),
    prisma.iGThread
      .findMany({
        where: {
          workspaceId: workspace.id,
          relevance: { gte: MIN_IG_DISCOVERED_RELEVANCE },
        },
        orderBy: [{ relevance: "desc" }, { discoveredAt: "desc" }],
        take: 20,
      })
      .catch(() => []),
    prisma.iGCreator
      .findMany({
        where: { workspaceId: workspace.id },
        orderBy: [
          { qualityScore: "desc" },
          { fit: "desc" },
          { discoveredAt: "desc" },
        ],
        take: 100,
      })
      .catch(() => []),
    prisma.iGCampaign
      .findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        include: {
          negotiations: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              status: true,
              autopilot: true,
              agreedPrice: true,
              messages: true,
              creator: {
                select: { handle: true, followers: true, profilePicture: true },
              },
            },
          },
        },
      })
      .catch(() => []),
    hasIGCookies(workspace.id).catch(() => false),
  ]);

  const postDrafts = drafts.filter((d) => {
    const kind = getKind(d.meta);
    return (
      kind &&
      (kind === "post" || kind === "reel" || kind === "story") &&
      igPostDraftMatchesSite(d.meta, workspace.websiteUrl)
    );
  });
  const reelDrafts = postDrafts.filter((d) => getKind(d.meta) === "reel");
  const storyDrafts = postDrafts.filter((d) => getKind(d.meta) === "story");
  const feedDrafts = postDrafts.filter((d) => getKind(d.meta) === "post");
  const replyDrafts = drafts.filter((d) => getKind(d.meta) === "comment_reply");
  const dmDrafts = drafts.filter((d) => {
    const k = getKind(d.meta);
    return k === "dm_outreach" || k === "dm_negotiation";
  });

  const igLabel = igAccount?.username
    ? `@${igAccount.username}`
    : igAccount?.pageName ?? "Connected";

  const hasApifyToken = Boolean(env.APIFY_IG_TOKEN || env.APIFY_TOKEN);

  const negCampaigns: NegCampaign[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    brand: c.brand,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    status: c.status,
    autopilot: c.autopilot,
    negotiations: c.negotiations.map((n) => {
      const msgs = (Array.isArray(n.messages) ? n.messages : []) as Array<{
        role?: string;
        text?: string;
      }>;
      const last = msgs[msgs.length - 1];
      return {
        id: n.id,
        handle: n.creator.handle,
        followers: n.creator.followers,
        profilePicture: n.creator.profilePicture,
        status: n.status,
        agreedPrice: n.agreedPrice,
        lastMessage: last?.text ?? null,
        lastRole: last?.role ?? null,
      };
    }),
  }));

  const creatorRows: CreatorRow[] = creators.map((c) => ({
    id: c.id,
    handle: c.handle,
    fullName: c.fullName,
    bio: c.bio,
    followers: c.followers,
    following: c.following,
    engagementRate: c.engagementRate,
    qualityScore: c.qualityScore,
    email: c.email,
    category: c.category,
    isVerified: c.isVerified,
    profileUrl: c.profileUrl,
    profilePicture: c.profilePicture,
    lastDmAt: c.lastDmAt,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">
              Instagram Agent
            </h1>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Find creators in your niche, copy a personalized DM, and (optionally)
            generate daily Post / Reel / Story drafts in your brand voice.{" "}
            {integration
              ? `Connected as ${igLabel}.`
              : "Connect Instagram via Facebook Login to auto-publish."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!integration && (
            <Button asChild variant="default" size="sm">
              <a href="/api/integrations/instagram/start">Connect Instagram</a>
            </Button>
          )}
          <IGCookiesModal hasCookies={cookiesOn} />
        </div>
      </div>

      {/* ====== AI Negotiation Agent (Negotiate) ====== */}
      <NegotiateView campaigns={negCampaigns} hasCookies={cookiesOn} />

      {/* ====== PRIMARY VIEW: QuickAds-style InfluencerFind ====== */}
      <InfluencerFind
        initialCreators={creatorRows}
        hasApifyToken={hasApifyToken}
      />

      {/* ====== SECONDARY: Content drafts, replies, campaigns, runs ====== */}
      <div className="border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Content & engagement
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Daily Post / Reel / Story drafts and comment-reply automation. Run
          buttons below trigger one-off scans.
        </p>
        <InstagramRunButtons />

        <Tabs defaultValue="posts" className="mt-6 space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="posts">Posts ({feedDrafts.length})</TabsTrigger>
            <TabsTrigger value="reels">Reels ({reelDrafts.length})</TabsTrigger>
            <TabsTrigger value="stories">Stories ({storyDrafts.length})</TabsTrigger>
            <TabsTrigger value="replies">Replies ({replyDrafts.length})</TabsTrigger>
            <TabsTrigger value="discovered">
              Discovered ({threads.length})
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              Campaigns ({campaigns.length})
            </TabsTrigger>
            <TabsTrigger value="composer">Composer</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            <DraftList
              drafts={feedDrafts}
              empty="No feed-post drafts yet. Click Generate posts to create today's batch."
            />
          </TabsContent>

          <TabsContent value="reels">
            <DraftList
              drafts={reelDrafts}
              empty="No Reel drafts yet. Click Generate posts — Reels are generated alongside feed posts."
            />
          </TabsContent>

          <TabsContent value="stories">
            <DraftList drafts={storyDrafts} empty="No Story drafts yet." />
          </TabsContent>

          <TabsContent value="replies">
            <DraftList
              drafts={replyDrafts}
              empty="No reply drafts. Click Scan comments to look at your own posts."
            />
          </TabsContent>

          <TabsContent value="discovered">
            <Card>
              <CardHeader>
                <CardTitle>Discovered Instagram posts</CardTitle>
                <CardDescription>
                  Hashtag-discovered posts ranked by LLM relevance (≥
                  {Math.round(MIN_IG_DISCOVERED_RELEVANCE * 100)}%), highest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {threads.length === 0 ? (
                  <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Run Discover posts to populate this list.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {threads.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <a
                            href={t.permalink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-sm font-medium hover:text-primary"
                          >
                            @{t.authorHandle}
                          </a>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {t.caption}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t.likes} likes · {t.comments} comments · relevance{" "}
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

          <TabsContent value="campaigns" className="space-y-4">
            <CampaignForm />
            {dmDrafts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending DMs</CardTitle>
                  <CardDescription>
                    Outreach + negotiation messages awaiting approval or
                    scheduled to send.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {dmDrafts.map((d) => {
                      const kind = getKind(d.meta);
                      return (
                        <li key={d.id} className="py-3">
                          <Link
                            href={`/content/${d.id}`}
                            className="block hover:text-primary"
                          >
                            <div className="flex items-center gap-2">
                              {kind && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {igKindLabel(kind)}
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
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
            {campaigns.length === 0 ? (
              <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                No outreach campaigns yet. Create one to start finding
                influencers.
              </p>
            ) : (
              campaigns.map((c) => (
                <Card key={c.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        {c.name}
                        <Badge
                          variant={
                            c.status === "ACTIVE" ? "default" : "outline"
                          }
                        >
                          {c.status.toLowerCase()}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {c.brand} · budget ${c.budgetMin}–${c.budgetMax} ·{" "}
                        {c.negotiations.length} negotiation
                        {c.negotiations.length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                    <CampaignControls
                      campaignId={c.id}
                      status={c.status}
                      autopilot={c.autopilot}
                    />
                  </CardHeader>
                  {c.brief && (
                    <CardContent className="text-sm text-muted-foreground">
                      {c.brief.slice(0, 300)}
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="composer">
            <IGComposer />
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>Recent runs</CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runs yet. Click <Sparkles className="inline h-3 w-3" />{" "}
                    Generate posts above.
                  </p>
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
                            <span className="capitalize">
                              {r.status.toLowerCase()}
                            </span>
                            <span className="text-muted-foreground">
                              {format(r.startedAt, "MMM d · HH:mm")} ·{" "}
                              {r.creditsUsed} credits
                            </span>
                          </div>
                          {r.status === "SUCCESS" && out && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {typeof out.drafts === "number" &&
                                `Drafts: ${out.drafts} · `}
                              {typeof out.discovered === "number" &&
                                `Discovered: ${out.discovered} · `}
                              {typeof out.surfaced === "number" &&
                                `Engagement: ${out.surfaced}`}
                              {out.message ? ` — ${out.message}` : null}
                            </p>
                          )}
                          {r.status === "FAILED" && r.error && (
                            <p className="mt-1 text-xs text-destructive">
                              {r.error}
                            </p>
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
        <CardDescription>
          Awaiting your approval in the publish queue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {drafts.length === 0 ? (
          <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="divide-y">
            {drafts.map((d) => {
              const kind = getKind(d.meta);
              return (
                <li key={d.id} className="py-3">
                  <Link
                    href={`/content/${d.id}`}
                    className="block hover:text-primary"
                  >
                    <div className="flex items-center gap-2">
                      {kind && (
                        <Badge variant="secondary" className="text-[10px]">
                          {igKindLabel(kind)}
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

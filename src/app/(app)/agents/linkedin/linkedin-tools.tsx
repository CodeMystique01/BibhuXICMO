"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  Building2,
  ExternalLink,
  Heart,
  Loader2,
  MessageSquare,
  Repeat2,
  Sparkles,
  UserSearch,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  startCompanyPostsAction,
  startProfileAction,
  pollLinkedInToolAction,
  analyzeCompanyPostsAction,
  draftProfileOutreachAction,
  type CompanyPostsInsights,
  type ProfileOutreach,
} from "./linkedin-actions";
import type {
  LinkedInCompanyPostsResult,
  LinkedInProfileResult,
  LinkedInProfile,
} from "@/integrations/linkedin-apify";
import type { LinkedInPollInput } from "@/backend/linkedin-tools";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 4 * 60 * 1000;

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function RunningPanel({ elapsedMs, statusMsg }: { elapsedMs: number; statusMsg?: string }) {
  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="flex items-center gap-3 py-4 text-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Scraping LinkedIn via Apify…</div>
          <div className="text-xs text-muted-foreground">
            {statusMsg ? statusMsg : "Spinning up the actor."}{" "}
            <span className="tabular-nums">{seconds}s</span> elapsed · usually 30-90s.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function pollUntilDone(
  buildInput: () => LinkedInPollInput,
  onProgress: (elapsedMs: number, statusMsg?: string) => void
): Promise<
  | { ok: true; status: "DONE"; data: unknown; cachedAt: Date }
  | { ok: false; error: string }
> {
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let res;
    try {
      res = await pollLinkedInToolAction(buildInput());
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    if (!res.ok) return res;
    if (res.status === "DONE") return res;
    onProgress(Date.now() - start, res.statusMessage);
  }
  return {
    ok: false,
    error: "Apify run didn't finish within 4 minutes. Try again later.",
  };
}

// ===========================================================================

export function LinkedInTools({
  defaultCompany,
  hasApifyToken,
}: {
  defaultCompany: string;
  hasApifyToken: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">LinkedIn intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasApifyToken && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Add your Apify keys to enable scraping:{" "}
            <code>APIFY_LINKEDIN_PROFILE_TOKEN</code> (profiles) and{" "}
            <code>APIFY_LINKEDIN_POSTS_TOKEN</code> (company posts).
          </div>
        )}
        <Tabs defaultValue="company">
          <TabsList>
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Company insights
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5">
              <UserSearch className="h-3.5 w-3.5" /> Profile enrichment
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyInsightsTool defaultCompany={defaultCompany} disabled={!hasApifyToken} />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <ProfileEnrichmentTool disabled={!hasApifyToken} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CompanyInsightsTool({
  defaultCompany,
  disabled,
}: {
  defaultCompany: string;
  disabled: boolean;
}) {
  const [target, setTarget] = useState(defaultCompany);
  const [maxPosts, setMaxPosts] = useState(25);
  const [data, setData] = useState<LinkedInCompanyPostsResult | null>(null);
  const [insights, setInsights] = useState<CompanyPostsInsights | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalyze] = useTransition();

  function run() {
    if (!target.trim()) {
      toast.error("Enter a company or profile URL");
      return;
    }
    startTransition(async () => {
      setData(null);
      setInsights(null);
      setProgress(null);
      const targets = target
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await startCompanyPostsAction({ targets, maxPosts, includeReposts: true });
      if (!res.ok) {
        toast.error("Scan failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            type: "COMPANY_POSTS",
            targets,
            maxPosts,
            includeReposts: true,
            runId: res.runId,
            datasetId: res.datasetId,
          }),
          (elapsedMs, statusMsg) => setProgress({ elapsedMs, statusMsg })
        );
        setProgress(null);
        if (!final.ok) {
          toast.error("Apify run failed", { description: final.error, duration: 9000 });
          return;
        }
        setData(final.data as LinkedInCompanyPostsResult);
        toast.success("Posts scraped");
        return;
      }
      setData(res.data);
      toast.success(res.fromCache ? "Loaded from cache" : "Posts scraped");
    });
  }

  function analyze() {
    if (!data) return;
    startAnalyze(async () => {
      const res = await analyzeCompanyPostsAction({ result: data });
      if (!res.ok) {
        toast.error("Analysis failed", { description: res.error, duration: 8000 });
        return;
      }
      setInsights(res.data);
      toast.success(`Generated ${res.data.draftIds.length} draft${res.data.draftIds.length === 1 ? "" : "s"}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]">
        <div>
          <Label htmlFor="li-company">Company or profile URL(s)</Label>
          <Input
            id="li-company"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="linkedin.com/company/openai  (comma-separate up to 5)"
            className="mt-1.5"
            disabled={pending || disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="li-max">Max posts</Label>
          <Input
            id="li-max"
            type="number"
            min={1}
            max={50}
            value={maxPosts}
            onChange={(e) => setMaxPosts(Number(e.target.value))}
            className="mt-1.5"
            disabled={pending || disabled}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending || disabled} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Scan posts
          </Button>
        </div>
      </div>

      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}

      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold tabular-nums">{data.totalPosts}</span> posts ·
                sorted by engagement
              </div>
              <Button size="sm" variant="outline" onClick={analyze} disabled={analyzing} className="gap-1.5">
                {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Analyze + draft
              </Button>
            </div>

            {data.posts.length === 0 ? (
              <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                No posts found for that target.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.posts.slice(0, 12).map((p) => (
                  <li key={p.id} className="rounded-md border bg-card p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{p.authorName}</span>
                          {p.postedAgo && <span>· {p.postedAgo}</span>}
                          {p.type && p.type !== "post" && (
                            <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{p.content || "(no text)"}</p>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {fmt(p.likes)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {fmt(p.comments)}</span>
                      <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {fmt(p.shares)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {insights && <InsightsBlock insights={insights} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsightsBlock({ insights }: { insights: CompanyPostsInsights }) {
  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">Strategy summary</div>
        <p className="mt-1 text-sm">{insights.summary}</p>
      </div>
      {insights.whatWorks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">What works</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {insights.whatWorks.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {insights.contentGaps.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Gaps we can own</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {insights.contentGaps.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {insights.drafts.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            {insights.drafts.length} draft{insights.drafts.length === 1 ? "" : "s"} saved to your Drafts
          </div>
          <ul className="mt-1 space-y-2">
            {insights.drafts.map((d, i) => (
              <li key={i} className="rounded-md border bg-card p-2.5 text-sm">
                <div className="font-medium">{d.hook}</div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{d.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProfileEnrichmentTool({ disabled }: { disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<LinkedInProfile | null>(null);
  const [outreach, setOutreach] = useState<ProfileOutreach | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafting, startDraft] = useTransition();

  function run() {
    if (!query.trim()) {
      toast.error("Enter a LinkedIn profile URL");
      return;
    }
    startTransition(async () => {
      setProfile(null);
      setOutreach(null);
      setProgress(null);
      const res = await startProfileAction({ query });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            type: "PROFILE",
            query: query.trim(),
            runId: res.runId,
            datasetId: res.datasetId,
          }),
          (elapsedMs, statusMsg) => setProgress({ elapsedMs, statusMsg })
        );
        setProgress(null);
        if (!final.ok) {
          toast.error("Apify run failed", { description: final.error, duration: 9000 });
          return;
        }
        const result = final.data as LinkedInProfileResult;
        if (!result.profile) {
          toast.error("No profile data returned for that URL.");
          return;
        }
        setProfile(result.profile);
        toast.success("Profile enriched");
        return;
      }
      if (!res.data.profile) {
        toast.error("No profile data returned for that URL.");
        return;
      }
      setProfile(res.data.profile);
      toast.success(res.fromCache ? "Loaded from cache" : "Profile enriched");
    });
  }

  function draft() {
    if (!profile) return;
    startDraft(async () => {
      const res = await draftProfileOutreachAction({ profile });
      if (!res.ok) {
        toast.error("Draft failed", { description: res.error, duration: 8000 });
        return;
      }
      setOutreach(res.data);
      toast.success("Outreach drafted");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="li-profile">LinkedIn profile URL</Label>
          <Input
            id="li-profile"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="linkedin.com/in/williamhgates"
            className="mt-1.5"
            disabled={pending || disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending || disabled} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />}
            Enrich
          </Button>
        </div>
      </div>

      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}

      {profile && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{profile.fullName}</span>
                  {profile.verified && <Badge variant="success" className="text-[10px]">verified</Badge>}
                  {profile.openToWork && <Badge variant="outline" className="text-[10px]">open to work</Badge>}
                </div>
                {profile.headline && <p className="text-sm text-muted-foreground">{profile.headline}</p>}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {profile.location && <span>{profile.location}</span>}
                  {profile.currentCompany && <span>{profile.currentCompany}</span>}
                  {profile.connections != null && <span>{fmt(profile.connections)} connections</span>}
                  {profile.followers != null && <span>{fmt(profile.followers)} followers</span>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={draft} disabled={drafting} className="shrink-0 gap-1.5">
                {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Draft outreach
              </Button>
            </div>

            {profile.about && (
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{profile.about}</p>
            )}

            {profile.experience.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Experience</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {profile.experience.slice(0, 4).map((e, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{e.position ?? "—"} · {e.company ?? "—"}</span>
                      {e.duration && <span className="shrink-0 text-[11px] text-muted-foreground">{e.duration}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.slice(0, 12).map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            )}

            {outreach && (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-primary">Connection note</div>
                  <p className="mt-1 text-sm">{outreach.connectionNote}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Follow-up DM</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{outreach.dm}</p>
                </div>
                {outreach.talkingPoints.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Talking points</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                      {outreach.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

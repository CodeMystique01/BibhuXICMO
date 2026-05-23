"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Globe,
  Hash,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { clientNormalizeUrl } from "@/shared/normalize-url";

type BusinessProfile = {
  name: string;
  one_liner: string;
  summary: string;
  category: string;
  target_audience: string[];
  value_props: string[];
  pain_points: string[];
  keywords: string[];
  competitors_or_alternatives: string[];
  source_url: string;
  fetch_warning?: string;
};

type SubredditRec = {
  name: string;
  why: string;
  rules_friendly: number;
  audience_match: number;
  url?: string;
};

type Thread = {
  subreddit: string;
  title: string;
  body?: string;
  url: string;
  permalink?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  relevance?: number;
  why?: string;
  replies?: Array<{ tone: string; text: string }>;
};

type PostDraft = {
  subreddit: string;
  post_type: string;
  title: string;
  body: string;
  reasoning?: string;
};

type Health = {
  ok: boolean;
  llm: {
    provider: string;
    model: string;
    anthropic_configured: boolean;
    openai_configured: boolean;
  };
  reddit: {
    backend: string;
    apify_configured: boolean;
    praw_configured: boolean;
    anon_reachable: boolean;
  };
};

export function RedditAgentClient({ apiBase }: { apiBase: string | null }) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<
    "idle" | "analyzing" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [subs, setSubs] = useState<SubredditRec[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsProgress, setThreadsProgress] = useState<string>("");
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/api/health`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Health;
      setHealth(j);
    } catch {
      /* ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    return () => {
      sseRef.current?.close();
    };
  }, []);

  if (!apiBase) {
    return <BackendNotConfigured />;
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    const target = clientNormalizeUrl(url);
    if (!target) {
      toast.error("Enter a valid URL", { description: "e.g. yoursite.com" });
      return;
    }
    setUrl(target);
    setStage("analyzing");
    setError(null);
    setProfile(null);
    setSubs([]);
    setSelectedSubs(new Set());
    setThreads([]);
    setPosts([]);
    try {
      const r = await fetch(`${apiBase}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website_url: target, max_subreddits: 12 }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const data = (await r.json()) as {
        business: BusinessProfile;
        subreddits: SubredditRec[];
      };
      setProfile(data.business);
      setSubs(data.subreddits);
      // Pre-select the top 5 recommendations
      setSelectedSubs(new Set(data.subreddits.slice(0, 5).map((s) => s.name)));
      setStage("ready");
      toast.success(`Found ${data.subreddits.length} subreddit recommendations`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
      toast.error("Analyze failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  function toggleSub(name: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function findThreads() {
    if (!profile || selectedSubs.size === 0) return;
    sseRef.current?.close();
    setThreads([]);
    setThreadsLoading(true);
    setThreadsProgress("Connecting…");

    // POST + SSE via fetch + ReadableStream (EventSource only supports GET).
    const body = JSON.stringify({
      business: profile,
      subreddits: Array.from(selectedSubs),
      replies_per_thread: 3,
      max_threads: 20,
      min_relevance: 10,
      max_wait_seconds: 180,
    });

    fetch(`${apiBase}/api/threads/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const collected: Thread[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const blob of events) {
            const dataLine = blob
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine.slice("data: ".length));
              if (ev.type === "step") {
                setThreadsProgress(ev.message || "Working…");
              } else if (ev.type === "thread" && ev.thread) {
                collected.push(ev.thread as Thread);
                setThreads([...collected]);
              } else if (ev.type === "done") {
                if (Array.isArray(ev.threads) && collected.length === 0) {
                  setThreads(ev.threads as Thread[]);
                }
                if (ev.error) {
                  toast.error("Thread search finished with errors", {
                    description: String(ev.error).slice(0, 200),
                  });
                }
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      })
      .catch((err) => {
        toast.error("Thread stream failed", { description: err?.message });
      })
      .finally(() => {
        setThreadsLoading(false);
        setThreadsProgress("");
      });
  }

  async function generatePosts() {
    if (!profile || selectedSubs.size === 0) return;
    setPostsLoading(true);
    setPosts([]);
    try {
      const r = await fetch(`${apiBase}/api/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business: profile,
          subreddits: Array.from(selectedSubs),
          count: 4,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { posts: PostDraft[] };
      setPosts(data.posts ?? []);
      toast.success(`${data.posts?.length ?? 0} post drafts ready`);
    } catch (err) {
      toast.error("Post generation failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPostsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* URL input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Analyze a site
          </CardTitle>
          <CardDescription>
            Drop in a URL. The agent figures out the business, picks the
            right subreddits, surfaces threads worth a comment, and drafts
            human-style posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={analyze} className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yoursite.com"
                disabled={stage === "analyzing"}
                className="border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button
              type="submit"
              disabled={stage === "analyzing" || !url.trim()}
              className="gap-1.5"
            >
              {stage === "analyzing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  Analyze <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
          {health ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="gap-1.5 text-[10px]">
                <Activity className="h-3 w-3 text-emerald-500" />
                LLM: {health.llm.provider}/{health.llm.model}
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-[10px]">
                Reddit backend: {health.reddit.backend}
              </Badge>
              {!health.reddit.apify_configured ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-300"
                >
                  <AlertTriangle className="h-3 w-3" /> APIFY_TOKEN_REDDIT not
                  configured
                </Badge>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="flex items-start gap-2 p-4 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
            <div>
              <div className="font-semibold text-red-600 dark:text-red-300">
                Analyze failed
              </div>
              <p className="mt-1 text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Profile */}
      {profile ? <BusinessProfileCard profile={profile} /> : null}

      {/* Subreddits */}
      {subs.length > 0 ? (
        <SubredditPicker
          subs={subs}
          selected={selectedSubs}
          onToggle={toggleSub}
          onFindThreads={findThreads}
          onGeneratePosts={generatePosts}
          threadsLoading={threadsLoading}
          postsLoading={postsLoading}
        />
      ) : null}

      {/* Threads */}
      {threadsLoading || threads.length > 0 ? (
        <ThreadsList
          threads={threads}
          loading={threadsLoading}
          progress={threadsProgress}
        />
      ) : null}

      {/* Posts */}
      {postsLoading || posts.length > 0 ? (
        <PostsList posts={posts} loading={postsLoading} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Subcomponents
// ---------------------------------------------------------------------------

function BackendNotConfigured() {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Reddit backend not configured
        </CardTitle>
        <CardDescription>
          Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_REDDIT_AGENT_URL</code>{" "}
          on the Render web service to the public URL of your{" "}
          <code className="rounded bg-muted px-1">reddit-agent</code>{" "}
          service (e.g. <code className="rounded bg-muted px-1">https://reddit-agent.onrender.com</code>),
          then redeploy.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function BusinessProfileCard({ profile }: { profile: BusinessProfile }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" /> Business profile
        </CardTitle>
        <CardDescription>{profile.one_liner}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {profile.fetch_warning ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
            {profile.fetch_warning}
          </p>
        ) : null}
        <p className="leading-relaxed text-muted-foreground">
          {profile.summary}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="Category">
            <p>{profile.category}</p>
          </Section>
          <Section title="Source URL">
            <a
              href={profile.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-xs underline-offset-2 hover:underline"
            >
              {profile.source_url}
            </a>
          </Section>
          <Section title="Target audience">
            <ChipRow items={profile.target_audience} />
          </Section>
          <Section title="Pain points">
            <ChipRow items={profile.pain_points} />
          </Section>
          <Section title="Value props">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {profile.value_props.map((v, i) => (
                <li key={i} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Keywords">
            <ChipRow items={profile.keywords} />
          </Section>
        </div>
      </CardContent>
    </Card>
  );
}

function SubredditPicker({
  subs,
  selected,
  onToggle,
  onFindThreads,
  onGeneratePosts,
  threadsLoading,
  postsLoading,
}: {
  subs: SubredditRec[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onFindThreads: () => void;
  onGeneratePosts: () => void;
  threadsLoading: boolean;
  postsLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Subreddits ({subs.length})
          </CardTitle>
          <CardDescription>
            {selected.size} selected · Click cards to toggle, then run threads or generate posts.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onFindThreads}
            disabled={threadsLoading || selected.size === 0}
            className="gap-1.5"
          >
            {threadsLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding…
              </>
            ) : (
              <>
                <Hash className="h-3.5 w-3.5" /> Find threads
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onGeneratePosts}
            disabled={postsLoading || selected.size === 0}
            className="gap-1.5"
          >
            {postsLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting…
              </>
            ) : (
              <>
                <MessageCircle className="h-3.5 w-3.5" /> Generate posts
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {subs.map((s) => {
            const active = selected.has(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => onToggle(s.name)}
                className={
                  "rounded-md border p-3 text-left transition-colors " +
                  (active
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                    : "bg-card hover:border-primary/30 hover:bg-muted/40")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    r/{s.name}
                  </span>
                  {active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                  {s.why}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="outline">
                    fit {s.audience_match}/10
                  </Badge>
                  <Badge variant="outline">
                    welcoming {s.rules_friendly}/10
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ThreadsList({
  threads,
  loading,
  progress,
}: {
  threads: Thread[];
  loading: boolean;
  progress: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4 text-primary" /> Threads worth a comment
          {threads.length > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {threads.length}
            </Badge>
          ) : null}
        </CardTitle>
        {loading && progress ? (
          <CardDescription className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            {progress}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {threads.length === 0 && !loading ? (
          <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            No threads found yet — try lowering the relevance threshold or
            picking broader subreddits.
          </p>
        ) : null}
        {threads.map((t, i) => (
          <ThreadCard key={`${t.url}-${i}`} thread={t} />
        ))}
      </CardContent>
    </Card>
  );
}

function ThreadCard({ thread }: { thread: Thread }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="font-mono text-[10px]">
          r/{thread.subreddit}
        </Badge>
        {thread.score != null ? <span>↑ {thread.score}</span> : null}
        {thread.num_comments != null ? (
          <span>💬 {thread.num_comments}</span>
        ) : null}
        {thread.relevance != null ? (
          <Badge variant="outline" className="text-[10px]">
            relevance {thread.relevance}/10
          </Badge>
        ) : null}
      </div>
      <a
        href={thread.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1 block text-sm font-semibold leading-snug hover:underline"
      >
        {thread.title}
      </a>
      {thread.body ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {thread.body}
        </p>
      ) : null}
      {thread.why ? (
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          Why this thread: {thread.why}
        </p>
      ) : null}
      {thread.replies && thread.replies.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Draft replies
          </div>
          {thread.replies.map((r, i) => (
            <DraftCard key={i} label={r.tone} text={r.text} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PostsList({
  posts,
  loading,
}: {
  posts: PostDraft[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" /> Post drafts
          {posts.length > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {posts.length}
            </Badge>
          ) : null}
        </CardTitle>
        {loading ? (
          <CardDescription className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Drafting human-style posts…
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {posts.map((p, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="outline" className="font-mono text-[10px]">
                r/{p.subreddit}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {p.post_type}
              </Badge>
            </div>
            <h3 className="mt-2 text-sm font-semibold leading-snug">
              {p.title}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {p.body}
            </p>
            {p.reasoning ? (
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                Why: {p.reasoning}
              </p>
            ) : null}
            <div className="mt-2">
              <CopyButton text={`${p.title}\n\n${p.body}`} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DraftCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px] capitalize">
          {label}
        </Badge>
        <CopyButton text={text} />
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {text}
      </p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof window === "undefined") return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className="inline-flex h-6 items-center rounded-md border bg-background px-2 text-[11px] text-foreground"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

// Re-export to suppress unused-import warning for RefreshCw if needed.
export const _Icons = { RefreshCw };

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Link2,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import type { CmoData } from "@/backend/agents/cmo-data";
import type { LighthouseScores } from "@/backend/pagespeed";

function heuristicToLighthouse(
  h: NonNullable<CmoData["llmAnalysis"]>["heuristicLighthouse"]
): LighthouseScores {
  return {
    performance: h.performance,
    accessibility: h.accessibility,
    bestPractices: h.bestPractices,
    seo: h.seo,
  };
}

const TABS = [
  "health",
  "search",
  "traffic",
  "links",
  "technical",
  "aigeo",
  "checks",
] as const;
type CmoTab = (typeof TABS)[number];
const STORAGE_KEY = "cmo:analytics:tab";

export function AnalyticsPanel({ data }: { data: CmoData }) {
  const [tab, setTab] = useState<CmoTab>("health");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && TABS.includes(v as CmoTab)) setTab(v as CmoTab);
  }, []);

  function onChange(v: string) {
    if (TABS.includes(v as CmoTab)) {
      setTab(v as CmoTab);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, v);
      }
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" aria-hidden />
          Analytics
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        </CardTitle>
        <CardDescription>
          On-page signals, performance scores, and AI/GEO presence.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ConnectGoogleRow ga4={data.integrations.ga4} gsc={data.integrations.gsc} />

        <Tabs value={tab} onValueChange={onChange} className="flex flex-1 flex-col">
          <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex w-auto min-w-full whitespace-nowrap">
              <TabsTrigger value="health" className="text-xs">Health</TabsTrigger>
              <TabsTrigger value="search" className="text-xs">Search</TabsTrigger>
              <TabsTrigger value="traffic" className="text-xs">Traffic</TabsTrigger>
              <TabsTrigger value="links" className="text-xs">Links</TabsTrigger>
              <TabsTrigger value="technical" className="text-xs">Tech</TabsTrigger>
              <TabsTrigger value="aigeo" className="text-xs">AI/GEO</TabsTrigger>
              <TabsTrigger value="checks" className="text-xs">Checks</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="health" className="flex-1">
            <HealthTab data={data} />
          </TabsContent>
          <TabsContent value="search" className="flex-1">
            <SearchTab data={data} />
          </TabsContent>
          <TabsContent value="traffic" className="flex-1">
            <TrafficTab data={data} />
          </TabsContent>
          <TabsContent value="links" className="flex-1">
            <LinksTab data={data} />
          </TabsContent>
          <TabsContent value="technical" className="flex-1">
            <TechnicalTab data={data} />
          </TabsContent>
          <TabsContent value="aigeo" className="flex-1">
            <AiGeoTab data={data} />
          </TabsContent>
          <TabsContent value="checks" className="flex-1">
            <ChecksTab data={data} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ConnectGoogleRow({ ga4, gsc }: { ga4: boolean; gsc: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ConnectCard
        title="Google Analytics"
        sub="Traffic & behavior"
        connected={ga4}
        href="/integrations/ga4"
        icon={BarChart3}
      />
      <ConnectCard
        title="Search Console"
        sub="Search rankings"
        connected={gsc}
        href="/integrations/gsc"
        icon={TrendingUp}
      />
    </div>
  );
}

function ConnectCard({
  title,
  sub,
  connected,
  href,
  icon: Icon,
}: {
  title: string;
  sub: string;
  connected: boolean;
  href: string;
  icon: typeof BarChart3;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {title}
            {connected ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            ) : null}
          </div>
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </div>
      <Button
        size="sm"
        variant={connected ? "secondary" : "default"}
        className="mt-3 w-full"
        asChild
      >
        <Link href={href}>{connected ? "Manage" : "Connect"}</Link>
      </Button>
    </div>
  );
}

function HealthTab({ data }: { data: CmoData }) {
  const snap = data.liveSnapshot;
  const title = (data.voice?.siteTitle || snap?.title || "").trim();
  const desc = (data.voice?.siteDescription || snap?.description || "").trim();
  const lang = snap?.lang?.trim() || null;
  const canonical = snap?.meta?.["og:url"]?.trim() || null;
  const llm = data.llmAnalysis;
  const pageSpeedOk = data.pageSpeed?.ok === true;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          On-page metadata and content signals
        </div>
        <SignalsTable
          rows={[
            {
              label: "Meta title",
              value: title ? `${title.length} chars` : "Missing",
              warn: !title || title.length < 25 || title.length > 65,
            },
            {
              label: "Meta description",
              value: desc ? `${desc.length} chars` : "Missing",
              warn: !desc || desc.length < 80 || desc.length > 165,
            },
            { label: "Canonical URL", value: canonical ?? "Missing", warn: !canonical },
            { label: "Language", value: lang ?? "Not set", warn: !lang },
          ]}
        />
      </div>

      {llm ? (
        <div className="rounded-md border bg-muted/15 p-3 text-xs leading-relaxed">
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            AI meta recommendations
          </div>
          {llm.metaRecommendations.titleSuggestion ? (
            <p className="mb-1.5">
              <span className="font-medium text-foreground">Title:</span>{" "}
              {llm.metaRecommendations.titleSuggestion}
            </p>
          ) : null}
          {llm.metaRecommendations.descriptionSuggestion ? (
            <p className="mb-1.5">
              <span className="font-medium text-foreground">Description:</span>{" "}
              {llm.metaRecommendations.descriptionSuggestion}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Canonical / URLs:</span>{" "}
            {llm.metaRecommendations.canonicalAdvice}
          </p>
        </div>
      ) : null}

      {data.pageSpeed ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              PageSpeed scores
            </div>
            <span className="text-[10px] text-muted-foreground">Lighthouse via Google</span>
          </div>
          <ScoreGrid label="Mobile" scores={data.pageSpeed.mobile} />
          <div className="mt-3" />
          <ScoreGrid label="Desktop" scores={data.pageSpeed.desktop} />
          {!pageSpeedOk ? (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              PageSpeed could not run for this URL right now. Add{" "}
              <code className="rounded bg-muted px-1">PAGESPEED_API_KEY</code> for
              higher quotas.
            </p>
          ) : null}
        </div>
      ) : null}

      {llm && (!data.pageSpeed || !pageSpeedOk) ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Estimated category scores
            </div>
            <span className="text-[10px] text-muted-foreground">
              From homepage signals · not Lighthouse
            </span>
          </div>
          <ScoreGrid
            label="AI baseline (mobile & desktop)"
            scores={heuristicToLighthouse(llm.heuristicLighthouse)}
          />
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {llm.heuristicLighthouse.rationale}
          </p>
        </div>
      ) : null}

      {!data.pageSpeed && !llm ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          Add an{" "}
          <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> or{" "}
          <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> for AI
          estimates, or{" "}
          <code className="rounded bg-muted px-1">PAGESPEED_API_KEY</code> for real
          Lighthouse scores.
        </div>
      ) : null}
    </div>
  );
}

function ScoreGrid({ label, scores }: { label: string; scores: LighthouseScores }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <ScoreCircle label="Performance" value={scores.performance} />
        <ScoreCircle label="A11y" value={scores.accessibility} />
        <ScoreCircle label="Best practices" value={scores.bestPractices} />
        <ScoreCircle label="SEO" value={scores.seo} />
      </div>
    </div>
  );
}

function ScoreCircle({ label, value }: { label: string; value: number | null }) {
  const pct = value ?? 0;
  const color =
    value == null
      ? "stroke-muted-foreground/30"
      : pct >= 90
        ? "stroke-emerald-500"
        : pct >= 50
          ? "stroke-amber-500"
          : "stroke-red-500";
  const text =
    value == null
      ? "text-muted-foreground"
      : pct >= 90
        ? "text-emerald-600 dark:text-emerald-400"
        : pct >= 50
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center rounded-md border bg-card/50 p-2 text-center">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r={radius}
          strokeWidth="4"
          className="stroke-muted"
          fill="none"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 24 24)"
          className={color}
        />
      </svg>
      <div className={`text-sm font-semibold tabular-nums ${text}`}>
        {value ?? "—"}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SearchTab({ data }: { data: CmoData }) {
  const llm = data.llmAnalysis;

  if (!data.gsc.connected) {
    const rows = llm?.suggestedQueriesToTrack ?? [];
    return (
      <div className="space-y-3">
        {rows.length > 0 ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="mr-2 text-[10px]">
                AI suggestions
              </Badge>
              Queries worth tracking — not from Search Console.{" "}
              <Link className="text-primary underline" href="/integrations/gsc">
                Connect GSC
              </Link>{" "}
              for real impressions and clicks.
            </p>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Query</th>
                    <th className="px-2 py-1.5 text-left">Intent</th>
                    <th className="px-2 py-1.5 text-left">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, 14).map((r) => (
                    <tr key={r.query}>
                      <td className="px-2 py-1.5 font-medium">{r.query}</td>
                      <td className="px-2 py-1.5 capitalize text-muted-foreground">
                        {r.intent}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        <EmptyConnect
          label="Connect Google Search Console"
          href="/integrations/gsc"
          body="See your top queries, impressions, and click-through rate from Google Search."
        />
      </div>
    );
  }
  if (data.gsc.rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No queries returned yet. New properties can take ~24 hours before GSC reports data.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {data.gsc.site ? (
        <p className="text-[11px] text-muted-foreground">
          Site: <span className="font-mono">{data.gsc.site}</span> · Last 30 days
        </p>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Query</th>
              <th className="px-2 py-1.5 text-right">Clicks</th>
              <th className="px-2 py-1.5 text-right">Impr.</th>
              <th className="px-2 py-1.5 text-right">CTR</th>
              <th className="px-2 py-1.5 text-right">Pos.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.gsc.rows.slice(0, 12).map((r) => (
              <tr key={r.query}>
                <td className="px-2 py-1.5 font-medium">{r.query}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.clicks}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.impressions}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {(r.ctr * 100).toFixed(1)}%
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.position.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrafficTab({ data }: { data: CmoData }) {
  const llm = data.llmAnalysis;
  const ahrefs = data.ahrefs.kind === "ready" ? data.ahrefs.snapshot : null;

  if (!data.ga4.connected) {
    return (
      <div className="space-y-3">
        {ahrefs ? (
          <AhrefsTrafficCard snapshot={ahrefs} stale={data.ahrefs.kind === "ready" && data.ahrefs.age === "stale"} />
        ) : null}
        {llm ? (
          <div className="rounded-md border bg-muted/15 p-4 text-xs leading-relaxed">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Qualitative traffic view (AI)
            </div>
            <p className="font-medium text-foreground">
              {llm.illustrativeTraffic.sessionsQualifier}
            </p>
            <p className="mt-2 text-muted-foreground">{llm.illustrativeTraffic.note}</p>
          </div>
        ) : null}
        <EmptyConnect
          label="Connect Google Analytics"
          href="/integrations/ga4"
          body="Pull real session, user, and conversion counts for the last 30 days."
        />
      </div>
    );
  }
  if (data.ga4.rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No GA4 rows returned yet — check that the connected property has live traffic.
      </p>
    );
  }
  const totalSessions = data.ga4.rows.reduce((s, r) => s + r.sessions, 0);
  const totalUsers = data.ga4.rows.reduce((s, r) => s + r.users, 0);
  const totalConv = data.ga4.rows.reduce((s, r) => s + r.conversions, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Sessions (30d)" value={totalSessions} />
        <Stat label="Users (30d)" value={totalUsers} />
        <Stat label="Conversions" value={totalConv} />
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Page</th>
              <th className="px-2 py-1.5 text-right">Sessions</th>
              <th className="px-2 py-1.5 text-right">Users</th>
              <th className="px-2 py-1.5 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.ga4.rows.slice(0, 10).map((r) => (
              <tr key={r.page}>
                <td className="max-w-[14rem] truncate px-2 py-1.5 font-mono text-[11px]" title={r.page}>
                  {r.page}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.sessions}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.users}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.conversions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.ga4.property ? (
        <p className="text-[10px] text-muted-foreground">
          Property: {data.ga4.property}
        </p>
      ) : null}
    </div>
  );
}

function EmptyConnect({
  label,
  href,
  body,
}: {
  label: string;
  href: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-dashed p-4 text-center">
      <p className="text-xs text-muted-foreground">{body}</p>
      <Button size="sm" className="mt-3" asChild>
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

function LinksTab({ data }: { data: CmoData }) {
  const links = data.liveSnapshot?.links ?? [];
  const internal = links.filter((l) => l.internal).length;
  const external = links.length - internal;
  const sample = links.slice(0, 8);
  const ahrefs = data.ahrefs.kind === "ready" ? data.ahrefs.snapshot : null;

  return (
    <div className="space-y-3">
      {ahrefs ? (
        <AhrefsBacklinksCard snapshot={ahrefs} stale={data.ahrefs.kind === "ready" && data.ahrefs.age === "stale"} />
      ) : null}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total links" value={links.length} />
        <Stat label="Internal" value={internal} />
        <Stat label="External" value={external} />
      </div>
      {sample.length > 0 ? (
        <ul className="divide-y rounded-md border text-xs">
          {sample.map((l, i) => (
            <li key={i} className="flex items-center gap-2 px-2 py-1.5">
              <Globe
                className={
                  "h-3.5 w-3.5 shrink-0 " +
                  (l.internal ? "text-primary" : "text-muted-foreground")
                }
                aria-hidden
              />
              <span className="flex-1 truncate" title={l.href}>
                {l.text || l.href}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No links found in the homepage scrape.</p>
      )}
    </div>
  );
}

function TechnicalTab({ data }: { data: CmoData }) {
  const snap = data.liveSnapshot;
  const llm = data.llmAnalysis;
  const noAlt = snap?.images?.filter((i) => !i.alt).length ?? 0;
  const totalImages = snap?.images?.length ?? 0;
  const jsonLd = snap?.jsonLd?.length ?? 0;
  const wordCount = snap?.wordCount ?? 0;
  const status = snap?.status ?? null;

  return (
    <div className="space-y-3">
      <SignalsTable
        rows={[
          { label: "Status code", value: status != null ? String(status) : "—", warn: status != null && status >= 400 },
          { label: "Images on page", value: String(totalImages), warn: false },
          {
            label: "Images missing alt",
            value: String(noAlt),
            warn: noAlt > 0,
          },
          {
            label: "Structured data (JSON-LD)",
            value: jsonLd > 0 ? `${jsonLd} block(s)` : "None",
            warn: jsonLd === 0,
          },
          {
            label: "Word count",
            value: String(wordCount),
            warn: wordCount < 300,
          },
          {
            label: "H1 count",
            value: String(snap?.h1?.length ?? 0),
            warn: !snap?.h1?.length || (snap?.h1?.length ?? 0) > 1,
          },
        ]}
      />
      {llm && llm.technicalPriorities.length > 0 ? (
        <div className="rounded-md border bg-muted/15 p-3 text-xs">
          <div className="mb-2 font-semibold text-foreground">AI priority fixes</div>
          <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
            {llm.technicalPriorities.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AiGeoTab({ data }: { data: CmoData }) {
  const llm = data.llmAnalysis;

  return (
    <div className="space-y-3">
      {llm ? (
        <div className="rounded-md border bg-muted/15 p-3 text-xs leading-relaxed">
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            AI visibility (homepage context)
          </div>
          <p className="text-muted-foreground">{llm.aiVisibility.summary}</p>
          {llm.aiVisibility.suggestedActions.length > 0 ? (
            <ul className="ml-4 mt-2 list-disc space-y-1 text-muted-foreground">
              {llm.aiVisibility.suggestedActions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <BigStat label="GEO score" value={data.scores.geo} suffix="/100" tone="primary" />
        <BigStat label="SEO score" value={data.scores.seo} suffix="/100" tone="default" />
        <BigStat
          label="Tracked queries"
          value={data.topKeywords.length}
          tone="default"
        />
      </div>

      {data.topKeywords.length > 0 ? (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tracked keywords
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {data.topKeywords.map((k) => (
              <li key={k.query}>
                <Badge variant="outline" className="text-[10px]">
                  {k.query}
                  {k.intent ? (
                    <span className="ml-1 text-muted-foreground">· {k.intent}</span>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No tracked keywords yet. Run the SEO or GEO agent to seed opportunities.
        </p>
      )}

      <div className="rounded-md border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden />
        GEO measures how often LLMs cite your brand. Run the GEO agent regularly for a
        measured score — the box above is an AI preview from your homepage only.
      </div>
    </div>
  );
}

function ChecksTab({ data }: { data: CmoData }) {
  const issues = data.topIssues;
  const llm = data.llmAnalysis;

  return (
    <div className="space-y-3">
      {llm ? (
        <div className="rounded-md border bg-muted/15 p-3 text-xs leading-relaxed">
          <div className="mb-2 font-semibold text-foreground">AI content review</div>
          <p className="text-muted-foreground">{llm.contentQuality.summary}</p>
          {llm.contentQuality.strengths.length > 0 ? (
            <div className="mt-2">
              <span className="font-medium text-foreground">Strengths:</span>
              <ul className="ml-4 mt-1 list-disc text-muted-foreground">
                {llm.contentQuality.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {llm.contentQuality.gaps.length > 0 ? (
            <div className="mt-2">
              <span className="font-medium text-foreground">Gaps:</span>
              <ul className="ml-4 mt-1 list-disc text-muted-foreground">
                {llm.contentQuality.gaps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          No SEO audit yet. Run the SEO agent to populate checks.
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {issues.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 px-3 py-2 text-xs">
              <SeverityDot s={i.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{i.title}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {i.category}
                  </Badge>
                </div>
                <p className="mt-0.5 leading-snug text-muted-foreground">{i.fix}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="link" className="h-auto px-0 text-xs" asChild>
        <Link href="/agents/seo">Open SEO agent →</Link>
      </Button>
    </div>
  );
}

function SeverityDot({ s }: { s: "low" | "medium" | "high" }) {
  const color =
    s === "high" ? "bg-red-500" : s === "medium" ? "bg-amber-500" : "bg-slate-400";
  return (
    <span
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function SignalsTable({
  rows,
}: {
  rows: Array<{ label: string; value: string; warn: boolean }>;
}) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="py-2 pr-2 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {r.warn ? (
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0 text-amber-500"
                    aria-hidden
                  />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 opacity-0" aria-hidden />
                )}
                {r.label}
              </span>
            </td>
            <td
              className={
                "py-2 text-right font-mono text-xs " +
                (r.warn ? "text-amber-600 dark:text-amber-400" : "")
              }
            >
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  tone: "primary" | "default";
}) {
  const text =
    tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-md border bg-card/40 p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${text}`}>
        {value ?? "—"}
        {value != null && suffix ? (
          <span className="ml-0.5 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Ahrefs visualizations — surface the paid Apify snapshot in Traffic + Links
// ---------------------------------------------------------------------------

type AhrefsSnap = NonNullable<
  Extract<CmoData["ahrefs"], { kind: "ready" }>
>["snapshot"];

function AhrefsTrafficCard({
  snapshot,
  stale,
}: {
  snapshot: AhrefsSnap;
  stale: boolean;
}) {
  return (
    <section className="rounded-lg border bg-gradient-to-br from-primary/5 via-transparent to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">Ahrefs traffic snapshot</h3>
          {stale ? (
            <Badge variant="outline" className="text-[10px]">
              stale
            </Badge>
          ) : null}
        </div>
        <span className="text-[10px] text-muted-foreground">
          via Apify · {snapshot.domain}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <AhrefsStat
          label="Organic traffic / mo"
          value={snapshot.organicTraffic}
          formatter={formatCompactNum}
          accent
        />
        <AhrefsStat
          label="Last month"
          value={snapshot.organicTrafficLastMonth}
          formatter={formatCompactNum}
        />
        <AhrefsStat
          label="Traffic value"
          value={snapshot.organicTrafficValue}
          formatter={(n) => `$${formatCompactNum(n)}`}
        />
        <AhrefsStat
          label="Tracked keywords"
          value={snapshot.organicKeywords}
          formatter={formatCompactNum}
        />
      </div>

      {snapshot.topKeywords.length > 0 ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Search className="h-3 w-3" /> Top organic keywords
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Keyword</th>
                  <th className="px-2 py-1.5 text-right">Pos</th>
                  <th className="px-2 py-1.5 text-right">Vol</th>
                  <th className="px-2 py-1.5 text-right">Traffic</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snapshot.topKeywords.slice(0, 8).map((k, i) => (
                  <tr key={`${k.keyword}-${i}`} className="hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-medium">{k.keyword}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {k.position ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {k.volume != null ? formatCompactNum(k.volume) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {k.traffic != null ? formatCompactNum(k.traffic) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {snapshot.topCountries.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> Traffic by country
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.topCountries.slice(0, 8).map((c) => (
              <span
                key={c.country}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px]"
              >
                <span className="font-semibold uppercase">{c.country}</span>
                {c.share != null ? (
                  <span className="font-mono text-muted-foreground">
                    {formatPct(c.share)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Want session-level breakdowns, conversions, and revenue?{" "}
        <Link href="/integrations/ga4" className="underline-offset-2 hover:underline">
          Connect Google Analytics
        </Link>
        .
      </p>
    </section>
  );
}

function AhrefsBacklinksCard({
  snapshot,
  stale,
}: {
  snapshot: AhrefsSnap;
  stale: boolean;
}) {
  const drColor =
    snapshot.domainRating == null
      ? "text-muted-foreground"
      : snapshot.domainRating >= 70
        ? "text-emerald-500"
        : snapshot.domainRating >= 40
          ? "text-amber-500"
          : "text-red-500";

  return (
    <section className="rounded-lg border bg-gradient-to-br from-primary/5 via-transparent to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">Ahrefs backlink profile</h3>
          {stale ? (
            <Badge variant="outline" className="text-[10px]">
              stale
            </Badge>
          ) : null}
        </div>
        <span className="text-[10px] text-muted-foreground">
          via Apify · {snapshot.domain}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md border bg-card/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Domain Rating
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${drColor}`}>
            {snapshot.domainRating ?? "—"}
            {snapshot.domainRating != null ? (
              <span className="ml-1 text-xs text-muted-foreground">/ 100</span>
            ) : null}
          </div>
        </div>
        <AhrefsStat
          label="Backlinks"
          value={snapshot.backlinks}
          formatter={formatCompactNum}
        />
        <AhrefsStat
          label="Referring domains"
          value={snapshot.referringDomains}
          formatter={formatCompactNum}
        />
        <AhrefsStat
          label="Ahrefs Rank"
          value={snapshot.ahrefsRank}
          formatter={(n) => `#${formatCompactNum(n)}`}
        />
      </div>

      {snapshot.dofollowBacklinks != null ||
      snapshot.dofollowReferringDomains != null ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Dofollow:{" "}
          <span className="font-mono text-foreground">
            {snapshot.dofollowBacklinks != null
              ? formatCompactNum(snapshot.dofollowBacklinks)
              : "—"}
          </span>{" "}
          backlinks ·{" "}
          <span className="font-mono text-foreground">
            {snapshot.dofollowReferringDomains != null
              ? formatCompactNum(snapshot.dofollowReferringDomains)
              : "—"}
          </span>{" "}
          referring domains
        </p>
      ) : null}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Want per-page backlink lists and broken-link opportunities? See the{" "}
        <Link href="/agents/seo" className="underline-offset-2 hover:underline">
          SEO Agent
        </Link>
        .
      </p>
    </section>
  );
}

function AhrefsStat({
  label,
  value,
  formatter,
  accent,
}: {
  label: string;
  value: number | null;
  formatter?: (n: number) => string;
  accent?: boolean;
}) {
  const display =
    value == null ? "—" : formatter ? formatter(value) : value.toLocaleString();
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (accent ? "text-primary" : "text-foreground")
        }
      >
        {display}
      </div>
    </div>
  );
}

function formatCompactNum(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1_000)
    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatPct(share: number): string {
  // Some Ahrefs fields come as 0.41 (decimal), some as 41 (percent).
  const v = share > 1 ? share : share * 100;
  return `${v.toFixed(1)}%`;
}

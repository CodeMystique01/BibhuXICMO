"use client";

import { useState, useTransition } from "react";
import {
  BarChart3,
  Bot,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  ScanLine,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { pollSeoToolAction } from "../seo/keyword-tool-actions";
import {
  runAiVisibilityAction,
  runAiMetricsAction,
  runAiOverviewAction,
  runTopAiCitedAction,
  runAiCitationCheckAction,
  type AiCitationCheckResult,
} from "./geo-tool-actions";
import type {
  AiVisibilityResult,
  KeywordMetricsResult,
  SerpOverviewResult,
  TopWebsitesResult,
} from "@/backend/ahrefs-tools";
import type { SeoToolPollInput } from "@/backend/seo-tools-cache";

const COUNTRIES = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "in", label: "India" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "br", label: "Brazil" },
  { value: "mx", label: "Mexico" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "jp", label: "Japan" },
  { value: "ae", label: "UAE" },
  { value: "sg", label: "Singapore" },
] as const;

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 3 * 60 * 1000;

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function CountrySelect({
  value,
  onChange,
  disabled,
  id = "country",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {COUNTRIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function CacheBadge({ fromCache, at }: { fromCache: boolean; at: Date }) {
  return (
    <span className="text-[10px] text-muted-foreground">
      {fromCache ? "cached" : "fresh"} · {new Date(at).toLocaleString()}
    </span>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function RunningPanel({ elapsedMs, statusMsg }: { elapsedMs: number; statusMsg?: string }) {
  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="flex items-center gap-3 py-4 text-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Running on Apify…</div>
          <div className="text-xs text-muted-foreground">
            {statusMsg ? statusMsg : "Spinning up the actor."} <span className="tabular-nums">{seconds}s</span> elapsed · usually 30-90s.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function pollUntilDone(
  buildInput: () => SeoToolPollInput,
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
      res = await pollSeoToolAction(buildInput());
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    if (!res.ok) return res;
    if (res.status === "DONE") return res;
    onProgress(Date.now() - start, res.statusMessage);
  }
  return {
    ok: false,
    error: "Apify run didn't finish within 3 minutes. Try again later.",
  };
}

// ---------------------------------------------------------------------------
export function GeoTools({
  defaultDomain,
  hasApifyToken,
}: {
  defaultDomain: string;
  hasApifyToken: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              GEO Tools
            </CardTitle>
            <CardDescription>
              Apify + LLM probes. First run takes 30-90s; results cache for 24h.
            </CardDescription>
          </div>
          {!hasApifyToken && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              APIFY_TOKEN missing
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="visibility">
          <div className="-mx-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex min-w-full whitespace-nowrap">
              <TabsTrigger value="visibility" className="gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5" /> AI Visibility
              </TabsTrigger>
              <TabsTrigger value="metrics" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" /> AI Metrics
              </TabsTrigger>
              <TabsTrigger value="citation" className="gap-1.5 text-xs">
                <ScanLine className="h-3.5 w-3.5" /> Citation Check
              </TabsTrigger>
              <TabsTrigger value="aio" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" /> AI Overview
              </TabsTrigger>
              <TabsTrigger value="top" className="gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" /> Top AI-cited
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="visibility" className="mt-4">
            <AiVisibilityTool defaultDomain={defaultDomain} />
          </TabsContent>
          <TabsContent value="metrics" className="mt-4">
            <AiMetricsTool />
          </TabsContent>
          <TabsContent value="citation" className="mt-4">
            <CitationCheckTool defaultDomain={defaultDomain} />
          </TabsContent>
          <TabsContent value="aio" className="mt-4">
            <AiOverviewTool />
          </TabsContent>
          <TabsContent value="top" className="mt-4">
            <TopAiCitedTool />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function AiVisibilityTool({ defaultDomain }: { defaultDomain: string }) {
  // The Apify Ahrefs scraper's AI Visibility flag needs a brand or keyword
  // (not a domain). Default to the brand inferred from the workspace URL,
  // but let the user override with any topic they want to track.
  const defaultBrand = (() => {
    const s = defaultDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!s) return "";
    const root = s.split(".")[0];
    return root.charAt(0).toUpperCase() + root.slice(1);
  })();
  const [keyword, setKeyword] = useState(defaultBrand);
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<AiVisibilityResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a brand or keyword");
      return;
    }
    startTransition(async () => {
      setData(null);
      setMeta(null);
      setProgress(null);
      const res = await runAiVisibilityAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            tool: "AI_VISIBILITY",
            keyword: keyword.trim(),
            country,
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
        setData(final.data as AiVisibilityResult);
        setMeta({ fromCache: false, at: final.cachedAt });
        toast.success("Fresh result");
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="av-keyword">Brand or keyword</Label>
          <Input
            id="av-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. github, agentic ai, hubspot"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="av-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="av-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Check visibility
          </Button>
        </div>
      </div>
      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <Stat label="Total citations" value={fmtNumber(data.totalCitations)} />
              <Stat label="Platforms detected" value={data.byProvider.length.toString()} />
            </div>
            {data.byProvider.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">By platform</div>
                <ul className="grid gap-2 sm:grid-cols-3">
                  {data.byProvider.map((p) => (
                    <li key={p.provider} className="rounded-md border bg-card px-3 py-2 text-sm">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.provider}</div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="text-lg font-semibold tabular-nums">{fmtNumber(p.citations)}</span>
                        <span className="text-[10px] text-muted-foreground">citations</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.topPages.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Top cited pages</div>
                <ul className="divide-y rounded-md border">
                  {data.topPages.slice(0, 10).map((p) => (
                    <li key={p.url} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="truncate">{p.url}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtNumber(p.mentions)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AiMetricsTool() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<KeywordMetricsResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a query");
      return;
    }
    startTransition(async () => {
      setData(null);
      setMeta(null);
      setProgress(null);
      const res = await runAiMetricsAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            tool: "KEYWORD_METRICS",
            keyword: keyword.trim().toLowerCase(),
            country,
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
        setData(final.data as KeywordMetricsResult);
        setMeta({ fromCache: false, at: final.cachedAt });
        toast.success("Fresh result");
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="am-kw">Query</Label>
          <Input
            id="am-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="how to choose a crm"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="am-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="am-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Get metrics
          </Button>
        </div>
      </div>
      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="AI search volume" value={fmtNumber(data.searchVolume)} />
              <Stat label="Topic difficulty" value={data.difficulty?.toString() ?? "—"} suffix="/100" />
              <Stat label="CPC" value={data.cpc !== null ? `$${data.cpc.toFixed(2)}` : "—"} />
              <Stat label="Click potential" value={fmtNumber(data.trafficPotential)} />
            </div>
            {data.intent && (
              <div className="text-xs">
                <span className="text-muted-foreground">Intent: </span>
                <Badge variant="outline" className="capitalize">{data.intent}</Badge>
              </div>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function CitationCheckTool({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AiCitationCheckResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!domain.trim() || !query.trim()) {
      toast.error("Enter a domain and a query");
      return;
    }
    startTransition(async () => {
      const res = await runAiCitationCheckAction({ domain, query });
      if (!res.ok) {
        toast.error("Probe failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh probe");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cc-domain">Domain</Label>
          <Input
            id="cc-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="cc-query">Query</Label>
          <Input
            id="cc-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="what is the best invoicing tool for freelancers"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
      </div>
      <Button onClick={run} disabled={pending} className="gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
        Probe LLMs
      </Button>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Citation score</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums">{data.citationScore}</span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {data.byProvider.length} provider{data.byProvider.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <ul className="space-y-2">
              {data.byProvider.map((p) => (
                <li key={p.provider} className="rounded-md border bg-card p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{p.provider}</Badge>
                    {p.cited ? (
                      <Badge variant="success" className="gap-1 text-[10px]">
                        <Check className="h-3 w-3" /> cited
                      </Badge>
                    ) : p.mentioned ? (
                      <Badge variant="secondary" className="text-[10px]">mentioned</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <X className="h-3 w-3" /> not cited
                      </Badge>
                    )}
                  </div>
                  {p.summary && <p className="text-xs text-muted-foreground">{p.summary}</p>}
                  {p.competitors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-muted-foreground">cites:</span>
                      {p.competitors.map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AiOverviewTool() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<SerpOverviewResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a query");
      return;
    }
    startTransition(async () => {
      setData(null);
      setMeta(null);
      setProgress(null);
      const res = await runAiOverviewAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            tool: "SERP_OVERVIEW",
            keyword: keyword.trim().toLowerCase(),
            country,
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
        setData(final.data as SerpOverviewResult);
        setMeta({ fromCache: false, at: final.cachedAt });
        toast.success("Fresh result");
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }

  const hasAio = data?.features.some((f) => /ai\s*overview|aio|sge/i.test(f)) ?? false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="aio-kw">Query</Label>
          <Input
            id="aio-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="best laptops for video editing"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="aio-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="aio-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Check AIO
          </Button>
        </div>
      </div>
      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              {hasAio ? (
                <Badge variant="success" className="gap-1">
                  <Check className="h-3 w-3" /> AI Overview present
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <X className="h-3 w-3" /> No AI Overview detected
                </Badge>
              )}
              {data.features
                .filter((f) => !/ai\s*overview|aio|sge/i.test(f))
                .slice(0, 6)
                .map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                ))}
            </div>
            {data.results.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Sources Google cites in the SERP / AIO</div>
                <ul className="divide-y rounded-md border">
                  {data.results.slice(0, 8).map((r) => (
                    <li key={`${r.position}-${r.url}`} className="px-3 py-2 text-sm">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 hover:underline"
                      >
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums">
                          {r.position}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.title}</div>
                          <div className="text-[10px] text-muted-foreground">{r.domain || r.url}</div>
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TopAiCitedTool() {
  const [country, setCountry] = useState("us");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<TopWebsitesResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setData(null);
      setMeta(null);
      setProgress(null);
      const res = await runTopAiCitedAction({ country, category: category || null });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            tool: "TOP_WEBSITES",
            country,
            category: category.trim().toLowerCase() || null,
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
        setData(final.data as TopWebsitesResult);
        setMeta({ fromCache: false, at: final.cachedAt });
        toast.success("Fresh result");
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto]">
        <div>
          <Label htmlFor="ta-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="ta-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div>
          <Label htmlFor="ta-cat">Category (optional)</Label>
          <Input
            id="ta-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="news, finance, technology…"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Top sites
          </Button>
        </div>
      </div>
      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            {data.entries.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                No matches. Try without a category filter.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.entries.slice(0, 25).map((e) => (
                  <li
                    key={`${e.rank}-${e.domain}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                      {e.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={`https://${e.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{e.domain}</span>
                      </a>
                      {e.category && (
                        <div className="text-[10px] text-muted-foreground">{e.category}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      {e.domainRating !== null && <span>DR {e.domainRating}</span>}
                      {e.traffic !== null && <span>{fmtNumber(e.traffic)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Info, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { cn } from "@/shared/utils";
import {
  backfillAiOverviewsAction,
  getProviderStatusAction,
  refreshAiCitationsAction,
  type ProviderStatus,
} from "./ai-citations-actions";
import {
  PLATFORMS,
  type AiCitationsBundle,
  type PlatformKey,
  type PlatformCounts,
} from "./ai-citations-types";

function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function delta(current?: PlatformCounts, previous?: PlatformCounts) {
  const c = current?.citations;
  const p = previous?.citations;
  const pc = current?.pages;
  const pp = previous?.pages;
  return {
    citationsDelta: c !== undefined && p !== undefined ? c - p : null,
    pagesDelta: pc !== undefined && pp !== undefined ? pc - pp : null,
  };
}

function formatDelta(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function deltaClass(n: number | null): string {
  if (n === null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-500" : "text-rose-500";
}

// ---------------------------------------------------------------------------
// Brand icons (inline SVGs — no extra deps).
// ---------------------------------------------------------------------------
function PlatformIcon({ k, className }: { k: PlatformKey; className?: string }) {
  const cls = cn("h-5 w-5", className);
  switch (k) {
    case "aiOverviews":
      return <Sparkles className={cn(cls, "text-sky-400")} />;
    case "chatgpt":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cn(cls, "text-zinc-300 dark:text-zinc-100")}>
          <path d="M22.28 9.81a5.93 5.93 0 0 0-.5-4.88 6 6 0 0 0-6.46-2.87 6 6 0 0 0-10.17 2.16 5.93 5.93 0 0 0-3.95 2.87 6 6 0 0 0 .74 7.07 5.94 5.94 0 0 0 .51 4.88 6 6 0 0 0 6.45 2.87 5.96 5.96 0 0 0 4.51 2.02 6 6 0 0 0 5.71-4.17 5.94 5.94 0 0 0 3.95-2.88 6 6 0 0 0-.79-7.07Zm-9 12.55a4.42 4.42 0 0 1-2.84-1.04l.14-.08 4.71-2.72a.78.78 0 0 0 .38-.67v-6.65l2 1.15a.07.07 0 0 1 .04.05v5.5a4.46 4.46 0 0 1-4.43 4.46Zm-9.55-4.08a4.45 4.45 0 0 1-.53-3l.14.08 4.72 2.72a.77.77 0 0 0 .77 0l5.76-3.32v2.3a.07.07 0 0 1-.03.06l-4.77 2.75a4.46 4.46 0 0 1-6.06-1.63Zm-1.24-10.31a4.43 4.43 0 0 1 2.32-1.95v5.6a.77.77 0 0 0 .39.68l5.74 3.31-1.99 1.15a.07.07 0 0 1-.07 0l-4.77-2.75a4.46 4.46 0 0 1-1.62-6.04Zm16.37 3.8-5.76-3.34 1.99-1.14a.07.07 0 0 1 .07 0l4.77 2.75a4.46 4.46 0 0 1-.67 8.04v-5.6a.79.79 0 0 0-.4-.71Zm1.98-2.99-.13-.08-4.72-2.74a.77.77 0 0 0-.77 0l-5.76 3.32V6.98a.07.07 0 0 1 .03-.06l4.77-2.75a4.46 4.46 0 0 1 6.58 4.61Zm-12.47 4.1L6.5 11.74v-3.4a4.46 4.46 0 0 1 7.32-3.42l-.14.08-4.71 2.72a.78.78 0 0 0-.39.67Zm1.08-2.35 2.56-1.48 2.57 1.48v2.96l-2.56 1.48-2.57-1.48Z" />
        </svg>
      );
    case "gemini":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cn(cls, "text-violet-400")}>
          <path d="M12 2 9.83 9.83 2 12l7.83 2.17L12 22l2.17-7.83L22 12l-7.83-2.17Z" />
        </svg>
      );
    case "perplexity":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(cls, "text-teal-400")}>
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" />
        </svg>
      );
    case "copilot":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cn(cls, "text-amber-400")}>
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-2 14H6a4 4 0 1 1 0-8h2v8Zm6 0h-4V8h4a4 4 0 0 1 0 8Z" />
        </svg>
      );
    case "grok":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cn(cls, "text-zinc-500 dark:text-zinc-300")}>
          <circle cx="12" cy="12" r="9" />
          <path d="m5 19 14-14" strokeLinecap="round" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------

export function AiCitationsPanel({
  initial,
  domain,
}: {
  initial: AiCitationsBundle | null;
  domain: string;
}) {
  const [bundle, setBundle] = useState<AiCitationsBundle | null>(initial);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [pending, startTransition] = useTransition();
  const [backfilling, startBackfill] = useTransition();

  useEffect(() => {
    getProviderStatusAction().then(setStatus).catch(() => undefined);
  }, []);

  function refresh() {
    if (!domain) {
      toast.error("Set your website URL in Settings first.");
      return;
    }
    startTransition(async () => {
      const res = await refreshAiCitationsAction({ domain });
      if (!res.ok) {
        toast.error("Couldn't refresh AI citations.");
        return;
      }
      setBundle(res.data);
      toast.success(
        res.data
          ? "Re-aggregated from LLM probes."
          : "No probes yet — click 'Run GEO check' above to populate."
      );
    });
  }

  function probeAiOverviewsNow() {
    if (!domain) {
      toast.error("Set your website URL in Settings first.");
      return;
    }
    startBackfill(async () => {
      const res = await backfillAiOverviewsAction({ domain });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.probed === 0) {
        toast.warning(
          "No prompts to probe yet — click 'Run GEO check' first so we know what queries to look up."
        );
        return;
      }
      // Reload aggregation so the AI Overviews tile updates.
      const refreshed = await refreshAiCitationsAction({ domain });
      if (refreshed.ok) setBundle(refreshed.data);
      toast.success(
        `Probed ${res.probed} prompts via Google SERP — ${res.hadOverview} had an AI Overview, ${res.cited} cited ${domain}.`
      );
    });
  }

  const aioConfigured = !!status?.configured.includes("aiOverviews");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-1.5 text-base">
              AI citations
              <span
                className="inline-flex"
                title="Citations come from your GEO LLM probes (OpenAI, Anthropic, Google) plus an Apify Google SERP probe for AI Overviews. Refreshing this panel re-aggregates existing data; the 'Probe AI Overviews' button fetches fresh AIO data via Apify."
              >
                <Info className="h-3 w-3 text-muted-foreground" />
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              From LLM probes (last 30 days) · Δ vs prior 30-day window.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={probeAiOverviewsNow}
              disabled={backfilling || pending || !domain || !aioConfigured}
              className="gap-1.5"
              title={
                aioConfigured
                  ? "Probe AI Overviews via Apify Google SERP for your existing prompts (no new prompts generated)."
                  : "Set APIFY_SEO_TOKEN or APIFY_TOKEN to enable."
              }
            >
              {backfilling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Probe AI Overviews
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={pending || !domain}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!domain && (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Add your website URL in Settings to track AI citations.
          </p>
        )}

        {domain && !bundle && (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No AI citation probes yet for <span className="font-medium">{domain}</span>.
            <br />
            Click <span className="font-medium">Run GEO check</span> at the top to run
            probes across OpenAI, Anthropic, and Google models.
          </p>
        )}

        {bundle && <CitationsBody bundle={bundle} status={status} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CitationsBody({
  bundle,
  status,
}: {
  bundle: AiCitationsBundle;
  status: ProviderStatus | null;
}) {
  const hero: PlatformKey[] = ["aiOverviews", "chatgpt"];
  const tableRows: PlatformKey[] = ["gemini", "perplexity", "copilot", "grok"];

  function hint(k: PlatformKey): string | undefined {
    if (!status) return undefined;
    if (status.configured.includes(k)) return undefined;
    return status.hints[k];
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hero.map((k) => (
          <HeroCard
            key={k}
            platformKey={k}
            current={bundle.current[k]}
            previous={bundle.previous[k]}
            hint={hint(k)}
          />
        ))}
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Platform</span>
          <span className="text-right">Citations</span>
          <span className="text-right">Pages</span>
        </div>
        {tableRows.map((k) => (
          <PlatformRow
            key={k}
            platformKey={k}
            current={bundle.current[k]}
            previous={bundle.previous[k]}
            hint={hint(k)}
          />
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground">
        Domain <span className="font-medium">{bundle.domain}</span> · Last probe{" "}
        {new Date(bundle.fetchedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function HeroCard({
  platformKey,
  current,
  previous,
  hint,
}: {
  platformKey: PlatformKey;
  current?: PlatformCounts;
  previous?: PlatformCounts;
  hint?: string;
}) {
  const meta = PLATFORMS.find((p) => p.key === platformKey);
  const { citationsDelta, pagesDelta } = delta(current, previous);
  const empty = !current || current.citations === 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span>{meta?.label}</span>
        {hint && (
          <span className="inline-flex" title={hint}>
            <Info className="h-3 w-3 text-muted-foreground/60" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <PlatformIcon k={platformKey} className="h-6 w-6" />
        <span className="text-4xl font-semibold tabular-nums text-sky-400">
          {fmtCount(current?.citations)}
        </span>
        {citationsDelta !== null && citationsDelta !== 0 && (
          <span className={cn("text-sm tabular-nums", deltaClass(citationsDelta))}>
            {formatDelta(citationsDelta)}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Pages</span>
        <span className="font-medium tabular-nums text-sky-400">
          {fmtCount(current?.pages)}
        </span>
        {pagesDelta !== null && pagesDelta !== 0 && (
          <span className={cn("text-xs tabular-nums", deltaClass(pagesDelta))}>
            {formatDelta(pagesDelta)}
          </span>
        )}
      </div>
      {empty && hint && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function PlatformRow({
  platformKey,
  current,
  previous,
  hint,
}: {
  platformKey: PlatformKey;
  current?: PlatformCounts;
  previous?: PlatformCounts;
  hint?: string;
}) {
  const meta = PLATFORMS.find((p) => p.key === platformKey);
  const { citationsDelta, pagesDelta } = delta(current, previous);
  const empty = !current || current.citations === 0;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
      <div className="flex items-center gap-2">
        <PlatformIcon k={platformKey} />
        <span className="flex items-center gap-1.5">
          {meta?.label}
          {empty && hint && (
            <span
              className="inline-flex text-muted-foreground/70"
              title={hint}
            >
              <Info className="h-3 w-3" />
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2 tabular-nums">
        <span className="text-sky-400">{fmtCount(current?.citations)}</span>
        {citationsDelta !== null && citationsDelta !== 0 && (
          <span className={cn("text-xs", deltaClass(citationsDelta))}>
            {formatDelta(citationsDelta)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 tabular-nums">
        <span className="text-sky-400">{fmtCount(current?.pages)}</span>
        {pagesDelta !== null && pagesDelta !== 0 && (
          <span className={cn("text-xs", deltaClass(pagesDelta))}>
            {formatDelta(pagesDelta)}
          </span>
        )}
      </div>
    </div>
  );
}

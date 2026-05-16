"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  BarChart3,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  refreshAhrefsSnapshotAction,
  type AhrefsActionResult,
} from "@/app/(app)/agents/seo/ahrefs-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";

type Snapshot = Extract<AhrefsActionResult, { ok: true }>["snapshot"];

export function AhrefsPanel({ hasWebsite }: { hasWebsite: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [isLoading, startLoading] = useTransition();

  function load() {
    setError(null);
    setNeedsConfig(false);
    startLoading(async () => {
      const res = await refreshAhrefsSnapshotAction();
      if (res.ok) {
        setSnapshot(res.snapshot);
        toast.success("Ahrefs snapshot updated");
      } else {
        setError(res.error);
        if (res.needsConfig) setNeedsConfig(true);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-4 w-4 text-primary" />
            Ahrefs snapshot
          </CardTitle>
          <CardDescription className="mt-1">
            Domain Rating, backlinks, organic traffic and top keywords —
            sourced live from Apify&rsquo;s Ahrefs scraper.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={load}
          disabled={isLoading || !hasWebsite}
          title={hasWebsite ? "Run the Apify Ahrefs actor" : "Add a website URL in Settings"}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching…
            </>
          ) : snapshot ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </>
          ) : (
            <>
              <TrendingUp className="h-3.5 w-3.5" />
              Fetch data
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!hasWebsite ? (
          <EmptyState
            title="Add a website URL"
            body={
              <>
                Set your workspace website in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                to pull Ahrefs data.
              </>
            }
          />
        ) : needsConfig ? (
          <EmptyState
            title="Configure APIFY_TOKEN"
            body={
              <>
                Add <code className="rounded bg-muted px-1 py-0.5 text-[11px]">APIFY_TOKEN</code>{" "}
                to your <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env</code>{" "}
                file and restart the dev server. Get a token at{" "}
                <a
                  href="https://console.apify.com/settings/integrations"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  console.apify.com
                </a>
                .
              </>
            }
          />
        ) : error && !snapshot ? (
          <EmptyState title="Ahrefs fetch failed" body={error} />
        ) : !snapshot ? (
          <EmptyState
            title="No data yet"
            body={
              <>
                Click <strong>Fetch data</strong> to run the Apify Ahrefs actor
                against your domain. Typically takes 10–30 seconds.
              </>
            }
          />
        ) : (
          <SnapshotView snapshot={snapshot} />
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Domain Rating" value={snapshot.domainRating} max={100} accent />
        <Metric
          label="Backlinks"
          value={snapshot.backlinks}
          formatter={formatCompact}
        />
        <Metric
          label="Referring domains"
          value={snapshot.referringDomains}
          formatter={formatCompact}
        />
        <Metric
          label="Organic traffic / mo"
          value={snapshot.organicTraffic}
          formatter={formatCompact}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Top organic keywords</h3>
          {snapshot.organicKeywords ? (
            <Badge variant="outline" className="text-[10px]">
              {formatCompact(snapshot.organicKeywords)} tracked
            </Badge>
          ) : null}
        </div>
        {snapshot.topKeywords.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            The actor didn&rsquo;t return a keyword list. Try a different actor
            via <code className="text-[11px]">APIFY_AHREFS_ACTOR_ID</code>.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Keyword</th>
                  <th className="px-2 py-2 text-right">Pos</th>
                  <th className="px-2 py-2 text-right">Vol</th>
                  <th className="px-2 py-2 text-right">Traffic</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {snapshot.topKeywords.map((kw, i) => (
                  <tr key={`${kw.keyword}-${i}`} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {kw.keyword}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {kw.position ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {kw.volume != null ? formatCompact(kw.volume) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {kw.traffic != null ? formatCompact(kw.traffic) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {kw.url ? (
                        <a
                          href={kw.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={kw.url}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {snapshot.topCountries.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Top traffic countries</h3>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Country</th>
                    <th className="px-2 py-2 text-right">Share</th>
                    <th className="px-2 py-2 text-right">Traffic</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {snapshot.topCountries.slice(0, 6).map((c) => (
                    <tr key={c.country} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium uppercase">{c.country}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {c.share != null ? `${(c.share * (c.share > 1 ? 1 : 100)).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {c.traffic != null ? formatCompact(c.traffic) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {snapshot.topPages.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Top traffic pages</h3>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">URL</th>
                    <th className="px-2 py-2 text-right">Traffic</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {snapshot.topPages.slice(0, 6).map((p, i) => (
                    <tr key={`${p.url}-${i}`} className="hover:bg-muted/30">
                      <td className="max-w-[18ch] px-3 py-2">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block truncate font-mono text-[11px] text-foreground underline-offset-2 hover:underline"
                          title={p.url}
                        >
                          {p.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </a>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {p.traffic != null ? formatCompact(p.traffic) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Link2 className="h-3 w-3" />
        <span>Source: Apify Ahrefs actor</span>
        <span>·</span>
        <span>{new Date(snapshot.fetchedAt).toLocaleString()}</span>
        <span>·</span>
        <span className="font-mono">{snapshot.domain}</span>
        <span>·</span>
        <span>mode: {snapshot.mode}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  max,
  accent,
  formatter,
}: {
  label: string;
  value: number | null;
  max?: number;
  accent?: boolean;
  formatter?: (n: number) => string;
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
        {max && value != null ? (
          <span className="ml-1 text-xs text-muted-foreground">/ {max}</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed py-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

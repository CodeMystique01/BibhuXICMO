"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Globe, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { clientNormalizeUrl } from "@/shared/normalize-url";

type AuditIssue = {
  severity: "low" | "medium" | "high";
  category: string;
  title: string;
  fix: string;
};

type Highlight = { label: string; value: string };

type LighthouseScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

type SuccessResponse = {
  ok: true;
  url: string;
  score: number;
  highlights: Highlight[];
  metadata: {
    title: string;
    description: string;
    h1: string[];
    lang: string | null;
    canonical: string | null;
    images: number;
    imagesMissingAlt: number;
    jsonLd: number;
    wordCount: number;
  };
  pageSpeed: { mobile: LighthouseScores; desktop: LighthouseScores; ok: boolean } | null;
  issues: AuditIssue[];
  moreIssues: number;
  note?: string;
};

type ErrorResponse = { ok: false; error: string };
type Response = SuccessResponse | ErrorResponse;

/**
 * Reusable public site-audit form.
 * - `compact` = single-row pill (homepage hero variant)
 * - default   = full-card with results below
 */
export function SiteAuditForm({
  compact = false,
  initialUrl,
  autoRun = false,
}: {
  compact?: boolean;
  initialUrl?: string;
  /** When true and `initialUrl` is set, kick off the audit on first mount.
   *  Used by shareable `/tools/site-audit?url=…` links. */
  autoRun?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ranOnceRef = useRef(false);

  const normalizedPreview = useMemo(
    () => clientNormalizeUrl(url),
    [url]
  );
  const showPreview =
    !!normalizedPreview &&
    url.trim().length > 0 &&
    normalizedPreview !== url.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const target = clientNormalizeUrl(url);
    if (!target) {
      setError("Enter a valid domain or URL (e.g. yoursite.com).");
      return;
    }
    // Reflect the normalized value back into the field so the user sees what we hit.
    if (target !== url.trim()) setUrl(target);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/public/site-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await res.json()) as Response;
      if (!data.ok) {
        setError(data.error);
      } else {
        setResult(data);
        // Nudge users into the workspace where they can rerun + get full insights.
        const prompt = `Audit this URL and tell me how to fix the top 3 issues: ${target}`;
        toast.success("Audit ready", {
          description: "Open the chat workbench to drill in with AI.",
          action: {
            label: "Open chat",
            onClick: () =>
              window.open(`/chat?prompt=${encodeURIComponent(prompt)}`, "_blank"),
          },
          duration: 8000,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function onBlur() {
    const target = clientNormalizeUrl(url);
    if (target && target !== url.trim()) setUrl(target);
  }

  // Auto-run when the page loads with a shared `?url=` param.
  useEffect(() => {
    if (!autoRun || !initialUrl || ranOnceRef.current) return;
    ranOnceRef.current = true;
    const e = new Event("submit", { cancelable: true, bubbles: true }) as unknown as React.FormEvent;
    void submit(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialUrl]);

  return (
    <div className={compact ? "w-full max-w-xl" : "w-full"}>
      <form
        onSubmit={submit}
        className={
          compact
            ? "flex w-full items-center gap-2 rounded-xl border bg-background/80 p-1.5 shadow-sm backdrop-blur"
            : "flex w-full flex-col gap-3 sm:flex-row"
        }
      >
        <div className="flex flex-1 items-center gap-2 px-2">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={onBlur}
            placeholder="yoursite.com"
            disabled={busy}
            className="border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            aria-label="Website URL"
          />
        </div>
        <Button type="submit" size={compact ? "default" : "lg"} disabled={busy || !url.trim()}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Auditing…
            </>
          ) : (
            <>
              Audit free
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {showPreview && !busy ? (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          We&rsquo;ll audit{" "}
          <span className="font-mono text-foreground">{normalizedPreview}</span>
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {result ? <AuditResultCard result={result} /> : null}

      {!compact && !result && !busy ? (
        <p className="mt-3 text-xs text-muted-foreground">
          We fetch your homepage live, parse the on-page signals, and score it
          against Google&rsquo;s Lighthouse criteria. Free, no sign-up required.
        </p>
      ) : null}
    </div>
  );
}

function AuditResultCard({ result }: { result: SuccessResponse }) {
  const { score, metadata, issues, pageSpeed, moreIssues } = result;
  const scoreColor =
    score >= 80
      ? "text-emerald-500"
      : score >= 50
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="mt-6 rounded-2xl border bg-card p-6 text-left shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`text-5xl font-semibold tabular-nums ${scoreColor}`}>
            {score}
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="text-foreground">Rule-based score</div>
            <div>out of 100</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ShareAuditButton url={result.url} />
          <div className="hidden truncate text-xs text-muted-foreground sm:block">
            <span className="font-mono">{result.url}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-6">
        <div
          aria-hidden
          className="pointer-events-none select-none blur-md"
        >
          {pageSpeed ? (
            <div className="grid grid-cols-2 gap-3">
              <ScoreBlock label="Mobile" scores={pageSpeed.mobile} />
              <ScoreBlock label="Desktop" scores={pageSpeed.desktop} />
            </div>
          ) : null}

          <div className="mt-6">
            <h3 className="text-sm font-semibold">On-page signals</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row k="Title" v={metadata.title || "(missing)"} />
              <Row
                k="Description"
                v={
                  metadata.description
                    ? `${metadata.description.length} chars`
                    : "(missing)"
                }
              />
              <Row k="H1 count" v={String(metadata.h1.length)} />
              <Row k="Word count" v={String(metadata.wordCount)} />
              <Row
                k="Images missing alt"
                v={`${metadata.imagesMissingAlt} / ${metadata.images}`}
              />
              <Row k="JSON-LD blocks" v={String(metadata.jsonLd)} />
              <Row k="Language" v={metadata.lang ?? "(not set)"} />
              <Row k="Canonical" v={metadata.canonical ?? "(not set)"} />
            </dl>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Top fixes</h3>
            {issues.length === 0 ? (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Looks healthy — no critical issues from the rule-based pass.
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded-md border">
                {issues.map((i, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 px-3 py-2 text-xs"
                  >
                    <span
                      className={
                        "mt-1 inline-block h-2 w-2 shrink-0 rounded-full " +
                        (i.severity === "high"
                          ? "bg-red-500"
                          : i.severity === "medium"
                            ? "bg-amber-500"
                            : "bg-slate-400")
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{i.title}</div>
                      <p className="mt-0.5 leading-snug text-muted-foreground">
                        {i.fix}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {moreIssues > 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                +{moreIssues} more issue{moreIssues === 1 ? "" : "s"} hidden
              </p>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-card/30 via-card/70 to-card/90 backdrop-blur-[1px]">
          <div className="mx-4 w-full max-w-sm rounded-2xl border bg-card/95 p-6 text-center shadow-xl ring-1 ring-border">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-base font-semibold">
              Sign up free to unlock the full report
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              See full Lighthouse scores, every on-page signal, the complete
              fix list, and AI-drafted patches you can ship as PRs.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button size="sm" asChild>
                <Link href="/register">
                  <Sparkles className="h-4 w-4" />
                  Sign up free
                </Link>
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareAuditButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof window === "undefined") return;
    const shareLink = `${window.location.origin}/tools/site-audit?url=${encodeURIComponent(
      url
    )}`;
    void navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      toast.success("Share link copied", {
        description: "Anyone with the link will see this audit re-run.",
      });
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <Button size="sm" variant="outline" onClick={copy}>
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Share
        </>
      )}
    </Button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="truncate text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono text-[11px]" title={v}>
        {v}
      </dd>
    </>
  );
}

function ScoreBlock({
  label,
  scores,
}: {
  label: string;
  scores: LighthouseScores;
}) {
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Mini label="Perf" value={scores.performance} />
        <Mini label="A11y" value={scores.accessibility} />
        <Mini label="Best" value={scores.bestPractices} />
        <Mini label="SEO" value={scores.seo} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  const color =
    value == null
      ? "text-muted-foreground"
      : value >= 90
        ? "text-emerald-500"
        : value >= 50
          ? "text-amber-500"
          : "text-red-500";
  return (
    <div className="text-center">
      <div className={`text-base font-semibold tabular-nums ${color}`}>
        {value ?? "—"}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
  Youtube,
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
import { Progress } from "@/frontend/components/ui/progress";
import { cn } from "@/shared/utils";
import {
  startYTDiscoveryAction,
  pollYTDiscoveryAction,
  recordYTContactAction,
  deleteYTCreatorAction,
  clearYTCreatorsAction,
} from "./discover-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type YTCreatorView = {
  id: string;
  channelId: string;
  handle: string | null;
  title: string;
  description: string | null;
  subscribers: number;
  videoCount: number | null;
  viewCount: string | null; // bigint serialised to string
  country: string | null;
  language: string | null;
  category: string | null;
  email: string | null;
  thumbnailUrl: string | null;
  channelUrl: string;
  isVerified: boolean;
  isCreator: boolean;
  qualityScore: number | null;
  detectionNote: string | null;
  lastContactAt: Date | null;
};

type RunInfo = {
  runId: string;
  datasetId: string;
  startedAt: number;
  keywords: string;
  country: string;
  language: string;
  minSubscribers: number;
  maxSubscribers: number;
  maxChannels: number;
  creatorsOnly: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 4_000;
const MAX_RUN_MS = 15 * 60 * 1000;
const RUN_STORAGE_KEY = "yt-discovery-run";

// QuickAds-parity multi-region list (25 countries).
const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: "ANY", label: "Any Country" },
  { value: "US", label: "United States" },
  { value: "IN", label: "India" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "ID", label: "Indonesia" },
  { value: "PH", label: "Philippines" },
  { value: "AE", label: "UAE" },
  { value: "SG", label: "Singapore" },
  { value: "NL", label: "Netherlands" },
  { value: "PL", label: "Poland" },
  { value: "TR", label: "Turkey" },
  { value: "RU", label: "Russia" },
  { value: "PE", label: "Peru" },
  { value: "AR", label: "Argentina" },
  { value: "CO", label: "Colombia" },
  { value: "ZA", label: "South Africa" },
];

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "ANY", label: "Any Language" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "id", label: "Indonesian" },
  { value: "tr", label: "Turkish" },
  { value: "it", label: "Italian" },
];

const SUBSCRIBER_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "Any size", min: 0, max: 0 },
  { label: "Nano (1K–10K)", min: 1_000, max: 10_000 },
  { label: "Micro (10K–100K)", min: 10_000, max: 100_000 },
  { label: "Mid (100K–500K)", min: 100_000, max: 500_000 },
  { label: "Macro (500K–5M)", min: 500_000, max: 5_000_000 },
  { label: "Mega (5M+)", min: 5_000_000, max: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtBigInt(s: string | null | undefined): string {
  if (!s) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return fmtNumber(n);
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function prettyStatus(s: string | null): string {
  if (!s) return "Starting…";
  if (s === "READY") return "Queued on Apify";
  if (s === "RUNNING") return "Scraping YouTube";
  if (s === "SUCCEEDED") return "Finishing up";
  if (s === "FAILED") return "Failed";
  if (s === "ABORTED") return "Aborted";
  if (s === "TIMED-OUT") return "Timed out";
  return s;
}

function qualityClasses(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 80)
    return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300";
  if (score >= 60)
    return "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300";
  if (score >= 35)
    return "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300";
}

function qualityLabel(score: number | null): string {
  if (score === null) return "—";
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 35) return "Average";
  return "Poor";
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function initials(name: string): string {
  const src = name.trim();
  if (!src) return "?";
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreatorSearch({
  initialCreators,
  hasApifyToken,
}: {
  initialCreators: YTCreatorView[];
  hasApifyToken: boolean;
}) {
  // -------------------- Form state --------------------
  const [keywords, setKeywords] = useState("");
  const [country, setCountry] = useState<string>("ANY");
  const [language, setLanguage] = useState<string>("ANY");
  const [bandIdx, setBandIdx] = useState<number>(0);
  const [maxChannels, setMaxChannels] = useState("50");
  const [creatorsOnly, setCreatorsOnly] = useState(true);

  // -------------------- Run state --------------------
  const [creators, setCreators] = useState<YTCreatorView[]>(initialCreators);
  const [pending, startTransition] = useTransition();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- Run persistence ----------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RUN_STORAGE_KEY);
      if (!raw) return;
      const r = JSON.parse(raw) as RunInfo;
      if (
        r &&
        typeof r.runId === "string" &&
        typeof r.datasetId === "string" &&
        Date.now() - r.startedAt < MAX_RUN_MS
      ) {
        setRun(r);
        setRunStatus("RUNNING");
        kickoffPolling(r);
      } else {
        window.localStorage.removeItem(RUN_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!run) {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
      return;
    }
    setElapsedMs(Date.now() - run.startedAt);
    tickTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - run.startedAt);
    }, 1000);
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    };
  }, [run]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  function persistRun(r: RunInfo | null) {
    if (typeof window === "undefined") return;
    if (r) window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(r));
    else window.localStorage.removeItem(RUN_STORAGE_KEY);
  }

  function clearRunState() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setRun(null);
    setRunStatus(null);
    setElapsedMs(0);
    persistRun(null);
  }

  function kickoffPolling(r: RunInfo) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const tick = async () => {
      try {
        const res = await pollYTDiscoveryAction({
          runId: r.runId,
          datasetId: r.datasetId,
          minSubscribers: r.minSubscribers,
          maxSubscribers: r.maxSubscribers,
          maxChannels: r.maxChannels,
          creatorsOnly: r.creatorsOnly,
        });
        if (!res.ok) {
          toast.error("Discovery failed", {
            description: res.error,
            duration: 8000,
          });
          clearRunState();
          return;
        }
        setRunStatus(res.status);
        if (!res.finished) {
          if (Date.now() - r.startedAt > MAX_RUN_MS) {
            toast.error("Discovery timed out", {
              description:
                "The Apify run is taking longer than 15 minutes — try narrower keywords or a smaller channel cap.",
            });
            clearRunState();
            return;
          }
          pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        // Finished.
        toast.success("Discovery complete", {
          description: `Found ${res.found} channel${res.found === 1 ? "" : "s"}, saved ${res.saved}${
            res.filteredOut > 0 ? ` (${res.filteredOut} filtered out)` : ""
          }.`,
          duration: 6000,
        });
        clearRunState();
        // Refresh the table — server-rendered data is the source of truth.
        // We can't fetch via server action, so just reload.
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      } catch (err) {
        toast.error("Polling failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        clearRunState();
      }
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  }

  function handleStart() {
    if (!hasApifyToken) {
      toast.error("Apify token not configured", {
        description:
          "Add APIFY_TOKEN (or APIFY_YT_TOKEN) to Render → Environment to enable YouTube creator discovery.",
        duration: 8000,
      });
      return;
    }
    const trimmed = keywords.trim();
    if (!trimmed) {
      toast.error("Enter at least one keyword", {
        description: "e.g. fitness coach, calisthenics, home workout",
      });
      return;
    }
    const band = SUBSCRIBER_BANDS[bandIdx];
    const cap = Math.max(10, Math.min(parseInt(maxChannels, 10) || 50, 200));

    startTransition(async () => {
      const res = await startYTDiscoveryAction({
        keywords: trimmed,
        country: country === "ANY" ? undefined : country,
        language: language === "ANY" ? undefined : language,
        minSubscribers: band.min,
        maxSubscribers: band.max,
        maxChannels: cap,
        creatorsOnly,
      });
      if (!res.ok) {
        toast.error("Could not start discovery", {
          description: res.error,
          duration: 8000,
        });
        return;
      }
      const r: RunInfo = {
        runId: res.runId,
        datasetId: res.datasetId,
        startedAt: Date.now(),
        keywords: trimmed,
        country,
        language,
        minSubscribers: band.min,
        maxSubscribers: band.max,
        maxChannels: cap,
        creatorsOnly,
      };
      setRun(r);
      setRunStatus(res.status);
      persistRun(r);
      kickoffPolling(r);
      toast.message("Searching YouTube", {
        description:
          "Apify is scraping channels. This usually takes 1–3 minutes. You can leave this page open.",
      });
    });
  }

  function handleAbort() {
    clearRunState();
    toast.message("Cancelled polling", {
      description:
        "The Apify run is still finishing on their side, but you won't get a notification when it does.",
    });
  }

  function exportCsv() {
    if (creators.length === 0) {
      toast.message("Nothing to export yet");
      return;
    }
    const headers = [
      "Channel",
      "Handle",
      "Subscribers",
      "Videos",
      "Total Views",
      "Country",
      "Language",
      "Category",
      "Email",
      "Channel URL",
      "Quality Score",
      "Is Creator",
      "Detection Note",
      "Verified",
      "Last Contacted",
    ];
    const lines = [headers.join(",")];
    for (const c of creators) {
      lines.push(
        [
          csvEscape(c.title),
          csvEscape(c.handle ?? ""),
          csvEscape(c.subscribers),
          csvEscape(c.videoCount ?? ""),
          csvEscape(c.viewCount ?? ""),
          csvEscape(c.country ?? ""),
          csvEscape(c.language ?? ""),
          csvEscape(c.category ?? ""),
          csvEscape(c.email ?? ""),
          csvEscape(c.channelUrl),
          csvEscape(c.qualityScore ?? ""),
          csvEscape(c.isCreator ? "yes" : "no"),
          csvEscape(c.detectionNote ?? ""),
          csvEscape(c.isVerified ? "yes" : "no"),
          csvEscape(c.lastContactAt ? new Date(c.lastContactAt).toISOString() : ""),
        ].join(",")
      );
    }
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `yt-creators-${Date.now()}.csv`);
  }

  function handleOpenChannel(c: YTCreatorView) {
    window.open(c.channelUrl, "_blank", "noopener,noreferrer");
    void recordYTContactAction(c.id);
    setCreators((arr) =>
      arr.map((x) => (x.id === c.id ? { ...x, lastContactAt: new Date() } : x))
    );
  }

  function handleEmail(c: YTCreatorView) {
    if (!c.email) return;
    window.open(
      `mailto:${c.email}?subject=${encodeURIComponent("Partnership opportunity with " + c.title)}`,
      "_blank"
    );
    void recordYTContactAction(c.id);
    setCreators((arr) =>
      arr.map((x) => (x.id === c.id ? { ...x, lastContactAt: new Date() } : x))
    );
  }

  function handleDelete(c: YTCreatorView) {
    startTransition(async () => {
      await deleteYTCreatorAction(c.id);
      setCreators((arr) => arr.filter((x) => x.id !== c.id));
      toast.message("Removed channel");
    });
  }

  function handleClear() {
    if (creators.length === 0) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete all ${creators.length} discovered channels? This can't be undone.`);
      if (!ok) return;
    }
    startTransition(async () => {
      await clearYTCreatorsAction();
      setCreators([]);
      toast.message("Cleared all channels");
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isRunning = !!run;
  const stats = {
    total: creators.length,
    creators: creators.filter((c) => c.isCreator).length,
    verified: creators.filter((c) => c.isVerified).length,
    withEmail: creators.filter((c) => c.email).length,
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border bg-gradient-to-br from-red-500/10 via-rose-500/5 to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-red-500/15 p-3 text-red-600 dark:text-red-400">
            <Youtube className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              YouTube Creator Search Engine
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Find genuine YouTube creators, not brand channels. Search by keyword
              across 25+ countries, filter by subscriber band, and export everything
              to CSV for outreach.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Smart creator detection
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" /> Subscriber filters
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" /> CSV export
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {creators.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Channels" value={stats.total.toString()} icon={Youtube} />
          <StatCard
            label="Real creators"
            value={`${stats.creators} / ${stats.total}`}
            icon={ShieldCheck}
          />
          <StatCard label="Verified" value={stats.verified.toString()} icon={CheckCircle2} />
          <StatCard label="With email" value={stats.withEmail.toString()} icon={Mail} />
        </div>
      )}

      {/* Search card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" /> Search Creators
              </CardTitle>
              <CardDescription>
                Powered by Apify. Each search analyses up to{" "}
                <strong>{maxChannels || 50}</strong> channels and finishes in 1–3
                minutes.
              </CardDescription>
            </div>
            {!hasApifyToken && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> Apify token missing
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="kw">Keywords</Label>
            <Input
              id="kw"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="fitness coach, home workout, calisthenics tutorial"
              className="mt-1.5"
              disabled={isRunning}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated. Up to 8 keywords per search.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="country">Country</Label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={isRunning}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lang">Language</Label>
              <select
                id="lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRunning}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="band">Subscribers</Label>
              <select
                id="band"
                value={bandIdx}
                onChange={(e) => setBandIdx(parseInt(e.target.value, 10))}
                disabled={isRunning}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {SUBSCRIBER_BANDS.map((b, i) => (
                  <option key={b.label} value={i}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="max">Max channels</Label>
              <Input
                id="max"
                type="number"
                value={maxChannels}
                onChange={(e) => setMaxChannels(e.target.value)}
                min={10}
                max={200}
                step={10}
                className="mt-1.5"
                disabled={isRunning}
              />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={creatorsOnly}
                  onChange={(e) => setCreatorsOnly(e.target.checked)}
                  disabled={isRunning}
                  className="h-4 w-4 rounded border-input"
                />
                <span>
                  <span className="font-medium">Creators only</span>{" "}
                  <span className="text-muted-foreground">
                    (filter out brand &amp; corporate channels)
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleStart} disabled={isRunning || pending} className="gap-2">
              {pending && !isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isRunning ? "Searching…" : pending ? "Starting…" : "Find Creators"}
            </Button>
            {isRunning && (
              <Button variant="ghost" onClick={handleAbort} className="gap-2">
                <X className="h-4 w-4" /> Cancel
              </Button>
            )}
            {creators.length > 0 && (
              <>
                <Button variant="outline" onClick={exportCsv} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Export CSV
                </Button>
                <Button variant="ghost" onClick={handleClear} className="gap-2 text-rose-600 hover:text-rose-700">
                  <Trash2 className="h-4 w-4" /> Clear all
                </Button>
              </>
            )}
          </div>

          {isRunning && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                  <span className="font-medium">{prettyStatus(runStatus)}</span>
                </span>
                <span className="text-muted-foreground">{fmtElapsed(elapsedMs)}</span>
              </div>
              <Progress value={Math.min(90, (elapsedMs / (5 * 60 * 1000)) * 100)} className="mt-2 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">
                Apify is scraping YouTube. Don&apos;t worry if this looks slow —
                results appear as soon as the run finishes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Discovered Creators</CardTitle>
          <CardDescription>
            {creators.length === 0
              ? "Run a search to populate this table."
              : `${creators.length} channels · sorted by quality score`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creators.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Youtube className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No channels yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Enter a keyword above and click <strong>Find Creators</strong>. We&apos;ll
                grab up to {maxChannels || 50} channels matching your filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Channel</th>
                    <th className="py-2 pr-3 font-medium">Subs</th>
                    <th className="py-2 pr-3 font-medium">Videos</th>
                    <th className="py-2 pr-3 font-medium">Country</th>
                    <th className="py-2 pr-3 font-medium">Quality</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {creators.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          {c.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.thumbnailUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-full border bg-muted object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500/30 to-rose-500/20 text-xs font-semibold text-red-700 dark:text-red-300">
                              {initials(c.title)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={c.channelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate font-medium hover:underline"
                              >
                                {c.title}
                              </a>
                              {c.isVerified && (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                              )}
                            </div>
                            {c.handle && (
                              <div className="truncate text-xs text-muted-foreground">
                                {c.handle}
                              </div>
                            )}
                            {c.description && (
                              <div
                                className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80"
                                title={c.description}
                              >
                                {c.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {fmtNumber(c.subscribers)}
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {c.videoCount === null ? (
                          "—"
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Video className="h-3 w-3 text-muted-foreground" />
                            {fmtNumber(c.videoCount)}
                          </span>
                        )}
                        {c.viewCount && (
                          <div className="text-[10px] text-muted-foreground">
                            {fmtBigInt(c.viewCount)} views
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {c.country ? (
                          <Badge variant="outline" className="text-xs">
                            {c.country}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            qualityClasses(c.qualityScore)
                          )}
                          title={
                            c.qualityScore !== null ? `Score ${c.qualityScore}/100` : undefined
                          }
                        >
                          {qualityLabel(c.qualityScore)}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {c.isCreator ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                            Creator
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 text-amber-700 dark:text-amber-300"
                            title={c.detectionNote ?? "Likely a brand or corporate channel"}
                          >
                            Brand
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {c.email ? (
                          <button
                            onClick={() => handleEmail(c)}
                            className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                            title={c.email}
                          >
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenChannel(c)}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            <ExternalLink className="h-3 w-3" /> Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(c)}
                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                            title="Remove from list"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

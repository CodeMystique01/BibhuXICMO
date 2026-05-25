"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Instagram,
  Loader2,
  Mail,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
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
import { Textarea } from "@/frontend/components/ui/textarea";
import { Badge } from "@/frontend/components/ui/badge";
import { Progress } from "@/frontend/components/ui/progress";
import { cn } from "@/shared/utils";
import {
  startIGSeedDiscoveryAction,
  startIGKeywordDiscoveryAction,
  pollIGDiscoveryAction,
  recordIGDmSentAction,
  deleteIGCreatorAction,
  clearIGCreatorsAction,
} from "./discover-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatorRow = {
  id: string;
  handle: string;
  fullName: string | null;
  bio: string | null;
  followers: number;
  following: number | null;
  engagementRate: number | null;
  qualityScore: number | null;
  email: string | null;
  category: string | null;
  isVerified: boolean;
  profileUrl: string;
  profilePicture: string | null;
  lastDmAt: Date | null;
};

type DiscoveryMode = "networkExpansion" | "keywordDiscovery";

type RunInfo = {
  runId: string;
  datasetId: string;
  mode: DiscoveryMode;
  startedAt: number;
  seeds: string[];
  /** Snapshot of the niche / filters so we can fire the Mode 4 fallback. */
  niche: string;
  location: string;
  minFollowers?: number;
  maxFollowers?: number;
  maxProfiles?: number;
  /** Set after we already fell back, so we don't loop. */
  fellBack?: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 4_000;
const MAX_RUN_MS = 15 * 60 * 1000; // 15 minutes
const RUN_STORAGE_KEY = "ig-discovery-run";

const LOCATIONS: Array<{ value: string; label: string }> = [
  { value: "ANY", label: "Any Location" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "IN", label: "India" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "BR", label: "Brazil" },
  { value: "AE", label: "UAE" },
  { value: "SG", label: "Singapore" },
];

const TEMPLATE_VARS = [
  { key: "name", label: "{name}" },
  { key: "username", label: "{username}" },
  { key: "followers", label: "{followers}" },
  { key: "category", label: "{category}" },
] as const;

const DEFAULT_TEMPLATE =
  "Hey {name}!\n\n" +
  "I came across your profile and love the content you create. " +
  "I think there's a great opportunity for us to collaborate.\n\n" +
  "Would you be open to a quick chat about a potential partnership?\n\n" +
  "Looking forward to hearing from you!";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function prettyStatus(s: string | null, mode: DiscoveryMode): string {
  const prefix = mode === "keywordDiscovery" ? "Keyword discovery" : "Network expansion";
  if (!s) return `${prefix} · Starting…`;
  if (s === "READY") return `${prefix} · Queued`;
  if (s === "RUNNING") return `${prefix} · Scraping creators`;
  if (s === "SUCCEEDED") return `${prefix} · Finishing up`;
  if (s === "FAILED") return `${prefix} · Failed`;
  if (s === "ABORTED") return `${prefix} · Aborted`;
  if (s === "TIMED-OUT") return `${prefix} · Timed out`;
  return `${prefix} · ${s}`;
}

function renderTemplate(tpl: string, c: CreatorRow): string {
  return tpl
    .replace(/\{name\}/gi, c.fullName || c.handle)
    .replace(/\{username\}/gi, c.handle)
    .replace(/\{followers\}/gi, fmtNumber(c.followers))
    .replace(/\{category\}/gi, c.category || "creator");
}

function qualityLabelFromScore(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 35) return "Average";
  return "Poor";
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name: string | null, handle: string): string {
  const src = (name || handle).trim();
  if (!src) return "?";
  const parts = src.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InfluencerFind({
  initialCreators,
  hasApifyToken,
}: {
  initialCreators: CreatorRow[];
  hasApifyToken: boolean;
}) {
  // -------------------- Form state --------------------
  const [seedsText, setSeedsText] = useState("");
  const [maxProfiles, setMaxProfiles] = useState("100");
  const [minFollowers, setMinFollowers] = useState("");
  const [maxFollowers, setMaxFollowers] = useState("");
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState<string>("ANY");

  // -------------------- Template state --------------------
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

  // -------------------- Run state --------------------
  const [creators, setCreators] = useState<CreatorRow[]>(initialCreators);
  const [pending, startTransition] = useTransition();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- Run persistence (survives page refresh) ----------
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

  // ---------- Live elapsed timer ----------
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

  // ---------- Run helpers ----------
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

  async function fallbackToKeywordDiscovery(prev: RunInfo) {
    if (!prev.niche.trim()) {
      toast.warning("No creators found", {
        description:
          "Network expansion returned 0 results. Add Niche / Keywords and try again, or use 3–5 seeds in the same niche.",
      });
      clearRunState();
      if (typeof window !== "undefined") window.location.reload();
      return;
    }
    toast.info("Auto-falling back to keyword discovery", {
      description: `No similar profiles around the seed graph. Searching by "${prev.niche.slice(0, 60)}" instead.`,
    });
    const res = await startIGKeywordDiscoveryAction({
      niche: prev.niche,
      minFollowers: prev.minFollowers,
      maxFollowers: prev.maxFollowers,
      maxProfiles: prev.maxProfiles,
      location: prev.location,
    });
    if (!res.ok) {
      toast.error("Keyword fallback failed", { description: res.error });
      clearRunState();
      return;
    }
    const next: RunInfo = {
      ...prev,
      runId: res.runId,
      datasetId: res.datasetId,
      mode: "keywordDiscovery",
      startedAt: Date.now(),
      fellBack: true,
    };
    setRun(next);
    setRunStatus(res.status);
    persistRun(next);
    kickoffPolling(next);
  }

  function kickoffPolling(r: RunInfo) {
    const tick = async () => {
      if (Date.now() - r.startedAt > MAX_RUN_MS) {
        toast.error("Discovery timed out", {
          description:
            "The Apify run is taking longer than 15 minutes. Check the Apify console — results may still arrive later.",
        });
        clearRunState();
        return;
      }
      try {
        const res = await pollIGDiscoveryAction({
          runId: r.runId,
          datasetId: r.datasetId,
        });
        if (!res.ok) {
          toast.error("Discovery failed", { description: res.error });
          clearRunState();
          return;
        }
        setRunStatus(res.status);
        if (res.finished) {
          // Mode 3 returned 0 + we haven't already fallen back? → auto Mode 4
          if (
            res.found === 0 &&
            r.mode === "networkExpansion" &&
            !r.fellBack &&
            r.niche.trim()
          ) {
            void fallbackToKeywordDiscovery(r);
            return;
          }
          toast.success(`Found ${res.found} creators`, {
            description:
              res.saved > 0
                ? `Saved ${res.saved} to your influencer list.`
                : "No new profiles matched the filters.",
          });
          clearRunState();
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
      } catch (err) {
        console.warn("[ig] poll error:", err);
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  }

  // ---------- Submit ----------
  async function onDiscover() {
    const seeds = seedsText
      .split(/[,\n;]+/)
      .map((s) => s.replace(/^@/, "").trim())
      .filter(Boolean);

    if (!hasApifyToken) {
      toast.error("Apify token missing", {
        description: "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment.",
      });
      return;
    }

    const filters = {
      minFollowers: minFollowers ? parseInt(minFollowers, 10) : undefined,
      maxFollowers: maxFollowers ? parseInt(maxFollowers, 10) : undefined,
      maxProfiles: maxProfiles ? parseInt(maxProfiles, 10) : 100,
    };

    const goKeyword = seeds.length === 0 && niche.trim().length > 0;
    if (seeds.length === 0 && !goKeyword) {
      toast.error("Add seed accounts or a niche", {
        description:
          "Enter 3–5 Instagram handles, or describe the niche in Niche / Keywords.",
      });
      return;
    }

    setRunStatus("Starting…");
    startTransition(async () => {
      try {
        const res = goKeyword
          ? await startIGKeywordDiscoveryAction({
              niche,
              ...filters,
              location,
            })
          : await startIGSeedDiscoveryAction({
              seeds,
              ...filters,
              niche,
              location,
            });
        if (!res.ok) {
          setRunStatus(null);
          toast.error("Could not start discovery", { description: res.error });
          return;
        }
        const r: RunInfo = {
          runId: res.runId,
          datasetId: res.datasetId,
          mode: res.mode,
          startedAt: Date.now(),
          seeds,
          niche,
          location,
          minFollowers: filters.minFollowers,
          maxFollowers: filters.maxFollowers,
          maxProfiles: filters.maxProfiles,
        };
        setRun(r);
        setRunStatus(res.status);
        persistRun(r);
        toast.success(
          res.mode === "keywordDiscovery"
            ? "Keyword discovery started"
            : "Network expansion started",
          {
            description: `Polling every 4s · this usually takes 1–5 minutes.`,
          }
        );
        kickoffPolling(r);
      } catch (err) {
        setRunStatus(null);
        toast.error("Could not start discovery", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function onCancelRun() {
    if (!run) return;
    if (
      !confirm(
        "Stop polling for this run? The Apify job will keep running on the server and you'll be billed for any profiles it analyzes before it finishes. Refresh this page later to pick up results."
      )
    ) {
      return;
    }
    clearRunState();
    toast.info("Stopped polling. The Apify job will finish in the background.");
  }

  // ---------- Template ----------
  function insertVariable(label: string) {
    setTemplate((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${label} `);
  }

  const previewCreator: CreatorRow = useMemo(
    () =>
      creators[0] ??
      ({
        id: "preview",
        handle: "sample_creator",
        fullName: "Sample Creator",
        bio: null,
        followers: 12500,
        following: null,
        engagementRate: 0.038,
        qualityScore: 72,
        email: null,
        category: "Lifestyle",
        isVerified: false,
        profileUrl: "https://instagram.com/sample_creator",
        profilePicture: null,
        lastDmAt: null,
      } as CreatorRow),
    [creators]
  );

  const livePreview = useMemo(
    () => renderTemplate(template, previewCreator),
    [template, previewCreator]
  );

  // ---------- DM ----------
  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function onSendDM(c: CreatorRow) {
    const text = renderTemplate(template, c);
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success("Message copied!", {
        description: "Paste (Ctrl/Cmd + V) in the Instagram DM window.",
      });
    } else {
      toast.error("Couldn't copy", {
        description: "Copy the message manually from the preview.",
      });
    }
    window.open(
      `https://www.instagram.com/${encodeURIComponent(c.handle)}/`,
      "_blank",
      "noopener,noreferrer"
    );
    void recordIGDmSentAction(c.id);
    setCreators((rows) =>
      rows.map((r) => (r.id === c.id ? { ...r, lastDmAt: new Date() } : r))
    );
  }

  async function onDMAll() {
    if (creators.length === 0) {
      toast.error("No creators to DM yet — run discovery first.");
      return;
    }
    if (
      !confirm(
        `This will open ${creators.length} Instagram tabs. The DM template will be copied to your clipboard before each tab. Continue?`
      )
    ) {
      return;
    }
    let i = 0;
    const step = () => {
      const c = creators[i];
      if (!c) {
        toast.success(`Opened ${creators.length} DM windows.`);
        return;
      }
      onSendDM(c);
      i++;
      setTimeout(step, 1800);
    };
    step();
  }

  // ---------- Export ----------
  function exportCSV() {
    const headers = [
      "Username",
      "Full Name",
      "Followers",
      "Engagement",
      "Quality",
      "Email",
      "Category",
      "Bio",
      "Profile URL",
    ];
    const lines = [headers.join(",")];
    for (const c of creators) {
      lines.push(
        [
          csvEscape(`@${c.handle}`),
          csvEscape(c.fullName ?? ""),
          csvEscape(c.followers),
          csvEscape(c.engagementRate !== null ? fmtPct(c.engagementRate) : ""),
          csvEscape(qualityLabelFromScore(c.qualityScore) ?? ""),
          csvEscape(c.email ?? ""),
          csvEscape(c.category ?? ""),
          csvEscape(c.bio ?? ""),
          csvEscape(c.profileUrl),
        ].join(",")
      );
    }
    downloadBlob(
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      `instagram-creators-${new Date().toISOString().slice(0, 10)}.csv`
    );
    toast.success("CSV exported");
  }

  function exportExcel() {
    const head = `
      <tr>
        <th>Username</th><th>Full Name</th><th>Followers</th>
        <th>Engagement</th><th>Quality</th><th>Email</th>
        <th>Category</th><th>Bio</th><th>Profile URL</th>
      </tr>`;
    const rows = creators
      .map(
        (c) => `
        <tr>
          <td>@${escapeHtml(c.handle)}</td>
          <td>${escapeHtml(c.fullName ?? "")}</td>
          <td>${c.followers}</td>
          <td>${c.engagementRate !== null ? fmtPct(c.engagementRate) : ""}</td>
          <td>${qualityLabelFromScore(c.qualityScore) ?? ""}</td>
          <td>${escapeHtml(c.email ?? "")}</td>
          <td>${escapeHtml(c.category ?? "")}</td>
          <td>${escapeHtml(c.bio ?? "")}</td>
          <td>${escapeHtml(c.profileUrl)}</td>
        </tr>`
      )
      .join("");
    const html = `<html><head><meta charset="utf-8"></head><body><table>${head}${rows}</table></body></html>`;
    downloadBlob(
      new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
      `instagram-creators-${new Date().toISOString().slice(0, 10)}.xls`
    );
    toast.success("Excel exported");
  }

  async function onDelete(c: CreatorRow) {
    if (!confirm(`Remove @${c.handle} from the list?`)) return;
    setCreators((rows) => rows.filter((r) => r.id !== c.id));
    await deleteIGCreatorAction(c.id);
  }

  async function onClearAll() {
    if (creators.length === 0) return;
    if (!confirm(`Clear all ${creators.length} creators?`)) return;
    setCreators([]);
    await clearIGCreatorsAction();
  }

  // ---------- Derived ----------
  const runActive = !!run;
  const progressPct = runActive
    ? Math.min(95, 5 + Math.round((elapsedMs / MAX_RUN_MS) * 90))
    : 0;
  const hasResults = creators.length > 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ============ Hero ============ */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-amber-500/10 p-6 md:p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-500/15 px-3 py-1 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300">
          <Sparkles className="h-3.5 w-3.5" />
          Instagram Influencer Discovery
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-4xl">
          Discover the perfect creators for your brand
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          Enter seed accounts from your niche. Our AI-powered scraper analyzes
          their network to find similar influencers with verified engagement
          metrics, then crafts your personalized cold DM.
        </p>
      </div>

      {/* ============ Search ============ */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-sm">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Search Influencers</CardTitle>
              <CardDescription>
                Configure your search parameters below
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Seed Accounts */}
          <div>
            <Label htmlFor="seeds" className="text-sm font-medium">
              Seed Accounts <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="seeds"
              value={seedsText}
              onChange={(e) => setSeedsText(e.target.value)}
              placeholder="e.g. nike, adidas, underarmour"
              disabled={pending || runActive}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Best results with 3–5 handles in the same niche, comma-separated,
              no @. A single seed often returns nothing — we&apos;ll auto-fall
              back to keyword discovery if it does.
            </p>
          </div>

          {/* Profiles / Min / Max */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="maxP" className="text-sm font-medium">
                Profiles to Find
              </Label>
              <Input
                id="maxP"
                inputMode="numeric"
                value={maxProfiles}
                onChange={(e) =>
                  setMaxProfiles(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="100"
                disabled={pending || runActive}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                $0.01 per analyzed profile on Apify.
              </p>
            </div>
            <div>
              <Label htmlFor="minF" className="text-sm font-medium">
                Min Followers
              </Label>
              <Input
                id="minF"
                inputMode="numeric"
                value={minFollowers}
                onChange={(e) =>
                  setMinFollowers(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="e.g. 1000"
                disabled={pending || runActive}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Wide ranges work best (e.g. 1K–500K)
              </p>
            </div>
            <div>
              <Label htmlFor="maxF" className="text-sm font-medium">
                Max Followers
              </Label>
              <Input
                id="maxF"
                inputMode="numeric"
                value={maxFollowers}
                onChange={(e) =>
                  setMaxFollowers(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="e.g. 500000"
                disabled={pending || runActive}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Tight windows often return 0 results
              </p>
            </div>
          </div>

          {/* Niche */}
          <div>
            <Label htmlFor="niche" className="text-sm font-medium">
              Niche / Keywords
            </Label>
            <Input
              id="niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. fitness, fashion, tech reviews"
              disabled={pending || runActive}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Describe the type of influencer you&apos;re looking for. Used as
              keyword-discovery fallback when seeds don&apos;t yield results.
            </p>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="loc" className="text-sm font-medium">
              Location
            </Label>
            <select
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={pending || runActive}
              className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* In-flight status */}
          {runActive && run && (
            <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {prettyStatus(runStatus, run.mode)}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {fmtElapsed(elapsedMs)}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelRun}
                  className="h-7 gap-1 text-xs text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                  Stop polling
                </Button>
              </div>
              <Progress value={progressPct} className="mt-2 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">
                This may take 5–15 minutes depending on the number of profiles.
                You can leave this tab open or come back later — the run
                survives a refresh.
              </p>
            </div>
          )}

          {/* CTA */}
          <Button
            type="button"
            onClick={onDiscover}
            disabled={pending || runActive}
            className={cn(
              "h-11 w-full gap-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md hover:from-fuchsia-600 hover:to-purple-700 hover:text-white",
              "disabled:from-fuchsia-500/60 disabled:to-purple-600/60"
            )}
          >
            {pending || runActive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {runActive ? "Discovery running…" : "Find Influencers"}
          </Button>

          {!hasApifyToken && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
              Set <code>APIFY_TOKEN</code> (or <code>APIFY_IG_TOKEN</code>) in
              Render → Environment to enable.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ============ DM Template ============ */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-sm">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">DM Outreach Template</CardTitle>
              <CardDescription>
                Craft your message — it&apos;s copied to clipboard before each
                DM opens
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed bg-muted/30 p-2.5 text-xs text-muted-foreground">
            When you click <span className="font-medium">Send DM</span>, your
            message is copied to clipboard. Just paste (Ctrl+V / Cmd+V) in the
            DM window and send.
          </div>

          <div>
            <Label className="text-sm font-medium">Message Template</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="mt-1.5 min-h-[140px] font-mono text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Insert:</span>
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.label)}
                  className="rounded-full border bg-muted/60 px-2.5 py-0.5 font-mono text-xs text-foreground transition hover:bg-primary hover:text-primary-foreground"
                >
                  + {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Live Preview · @{previewCreator.handle}
            </p>
            <p className="whitespace-pre-wrap text-sm">{livePreview}</p>
          </div>
        </CardContent>
      </Card>

      {/* ============ Results ============ */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {creators.length} Profiles Found
              </CardTitle>
              <CardDescription>
                Export your results or send DMs directly
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onDMAll}
              disabled={!hasResults}
              className="gap-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700 hover:text-white"
            >
              <Send className="h-3.5 w-3.5" />
              DM All ({creators.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCSV}
              disabled={!hasResults}
              className="gap-2"
            >
              <FileText className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportExcel}
              disabled={!hasResults}
              className="gap-2"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearAll}
              disabled={!hasResults}
              className="gap-2 text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!hasResults ? (
            <div className="px-6 py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No creators yet. Enter seed accounts above and click{" "}
                <span className="font-medium text-foreground">
                  Find Influencers
                </span>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left">Profile</th>
                    <th className="px-3 py-2.5 text-right">Followers</th>
                    <th className="px-3 py-2.5 text-right">Engagement</th>
                    <th className="px-3 py-2.5 text-center">Quality</th>
                    <th className="px-3 py-2.5 text-left">Email</th>
                    <th className="px-3 py-2.5 text-left">Category</th>
                    <th className="px-3 py-2.5 text-left">Bio</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((c, idx) => {
                    const ql = qualityLabelFromScore(c.qualityScore);
                    return (
                      <tr
                        key={c.id}
                        className="border-t transition-colors hover:bg-muted/30"
                      >
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <CreatorAvatar
                              src={c.profilePicture}
                              fullName={c.fullName}
                              handle={c.handle}
                            />
                            <div className="min-w-0">
                              <a
                                href={c.profileUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 font-medium hover:text-primary"
                              >
                                @{c.handle}
                                {c.isVerified && (
                                  <CheckCircle2 className="h-3.5 w-3.5 fill-blue-500 text-white" />
                                )}
                              </a>
                              {c.fullName && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {c.fullName}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fmtNumber(c.followers)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fmtPct(c.engagementRate)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {ql ? (
                            <span
                              className={cn(
                                "inline-block rounded px-2 py-0.5 text-[11px] font-medium",
                                qualityClasses(c.qualityScore)
                              )}
                              title={
                                c.qualityScore !== null
                                  ? `Score: ${c.qualityScore}`
                                  : undefined
                              }
                            >
                              {ql}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs hover:text-primary"
                              title={c.email}
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{c.email}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.category ? (
                            <Badge
                              variant="outline"
                              className="whitespace-nowrap text-[10px]"
                            >
                              {c.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <p
                            className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground"
                            title={c.bio ?? undefined}
                          >
                            {c.bio || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={c.lastDmAt ? "secondary" : "default"}
                              onClick={() => onSendDM(c)}
                              className={cn(
                                "h-8 gap-1 px-2.5 text-xs",
                                !c.lastDmAt &&
                                  "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700 hover:text-white"
                              )}
                              title={
                                c.lastDmAt
                                  ? `Last DM ${new Date(c.lastDmAt).toLocaleDateString()}`
                                  : "Copy template + open IG"
                              }
                            >
                              <Send className="h-3 w-3" />
                              {c.lastDmAt ? "Re-DM" : "Send DM"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                              className="h-8 px-2"
                              title="Open profile"
                            >
                              <a
                                href={c.profileUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDelete(c)}
                              className="h-8 px-2 text-muted-foreground"
                              title="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Instagram className="mr-1 inline h-3 w-3" />
        Powered by Apify · Built for influencer discovery
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar — round image with initials fallback
// ---------------------------------------------------------------------------
function CreatorAvatar({
  src,
  fullName,
  handle,
}: {
  src: string | null;
  fullName: string | null;
  handle: string;
}) {
  const [errored, setErrored] = useState(false);
  const useImage = src && !errored;
  if (useImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={fullName || handle}
        onError={() => setErrored(true)}
        className="h-9 w-9 shrink-0 rounded-full border bg-muted object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 text-[11px] font-semibold text-white">
      {initials(fullName, handle)}
    </div>
  );
}

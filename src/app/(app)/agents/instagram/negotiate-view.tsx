"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/shared/utils";
import { runAgentAction } from "@/app/(app)/agents/actions";
import {
  createIGCampaignAction,
  deleteIGCampaignAction,
  toggleIGCampaignAutopilotAction,
  updateIGCampaignStatusAction,
} from "./actions";

export type NegotiationView = {
  id: string;
  handle: string;
  followers: number;
  profilePicture: string | null;
  status: string;
  agreedPrice: number | null;
  lastMessage: string | null;
  lastRole: string | null;
};

export type NegCampaign = {
  id: string;
  name: string;
  brand: string;
  budgetMin: number;
  budgetMax: number;
  status: string;
  autopilot: boolean;
  negotiations: NegotiationView[];
};

const NEGOTIATING = new Set(["DM_SENT", "REPLIED", "NEGOTIATING"]);
const CLOSED = new Set(["AGREED", "CLOSED"]);

function statusBadge(status: string) {
  switch (status) {
    case "DM_SENT":
      return { label: "contacted", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" };
    case "REPLIED":
      return { label: "replied", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" };
    case "NEGOTIATING":
      return { label: "negotiating", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    case "AGREED":
    case "CLOSED":
      return { label: "closed", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "DECLINED":
      return { label: "rejected", cls: "bg-red-500/15 text-red-600 dark:text-red-400" };
    default:
      return { label: "prospect", cls: "bg-muted text-muted-foreground" };
  }
}

export function NegotiateView({
  campaigns,
  hasCookies,
}: {
  campaigns: NegCampaign[];
  hasCookies: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 via-purple-500/5 to-transparent p-5">
      {selected ? (
        <CampaignDetail campaign={selected} hasCookies={hasCookies} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                AI Negotiation <span className="text-fuchsia-500">Agent</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your AI handles the deal — it reads creator replies and crafts the
                perfect response, negotiating within budget (max 2 follow-ups).
              </p>
            </div>
            <Button
              onClick={() => setShowNew(true)}
              className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700"
            >
              <Plus className="h-4 w-4" /> New Campaign
            </Button>
          </div>

          {!hasCookies && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Add your Instagram session cookies (the <strong>Cookies</strong> button at the top of
              this page) so the AI can read replies and send DMs.
            </div>
          )}

          <div className="mt-4 space-y-2">
            {campaigns.length === 0 ? (
              <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                No campaigns yet. Click <strong>New Campaign</strong> to start.
              </p>
            ) : (
              campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} onOpen={() => setSelectedId(c.id)} />
              ))
            )}
          </div>
        </>
      )}

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function spentOf(c: NegCampaign): number {
  return c.negotiations
    .filter((n) => CLOSED.has(n.status))
    .reduce((sum, n) => sum + (n.agreedPrice ?? 0), 0);
}

function CampaignRow({ campaign: c, onOpen }: { campaign: NegCampaign; onOpen: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 p-4">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-purple-500/20">
          <Rocket className="h-4 w-4 text-fuchsia-500" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.brand} · ${c.budgetMin.toLocaleString()}–${c.budgetMax.toLocaleString()} ·{" "}
            {c.negotiations.length} influencer{c.negotiations.length === 1 ? "" : "s"}
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right">
          <div className="text-sm font-bold text-fuchsia-500">${spentOf(c).toLocaleString()}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</div>
        </div>
        <button
          onClick={() =>
            start(async () => {
              await deleteIGCampaignAction(c.id);
              router.refresh();
            })
          }
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete campaign"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CampaignDetail({
  campaign: c,
  hasCookies,
  onBack,
}: {
  campaign: NegCampaign;
  hasCookies: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "autopilot" | "check" | "add">(null);

  const stats = {
    total: c.negotiations.length,
    negotiating: c.negotiations.filter((n) => NEGOTIATING.has(n.status)).length,
    closed: c.negotiations.filter((n) => CLOSED.has(n.status)).length,
    rejected: c.negotiations.filter((n) => n.status === "DECLINED").length,
    spent: spentOf(c),
  };

  async function toggleAutopilot() {
    setBusy("autopilot");
    try {
      if (!c.autopilot && c.status !== "ACTIVE") {
        await updateIGCampaignStatusAction(c.id, "ACTIVE");
      }
      const res = await toggleIGCampaignAutopilotAction(c.id, !c.autopilot);
      if (res.ok) {
        toast.success(c.autopilot ? "Autopilot stopped" : "Autopilot started — AI will auto-respond");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function checkNow() {
    if (!hasCookies) {
      toast.error("Add your Instagram cookies first (Cookies button at top).");
      return;
    }
    setBusy("check");
    try {
      const res = await runAgentAction("instagram", { mode: "negotiate" });
      if (res.ok) {
        const out = res.output as { surfaced?: number; message?: string } | undefined;
        toast.success(
          out?.surfaced ? `${out.surfaced} reply/replies handled` : out?.message ?? "Inbox checked — no new replies"
        );
        router.refresh();
      } else {
        toast.error("Check failed", { description: res.error, duration: 8000 });
      }
    } finally {
      setBusy(null);
    }
  }

  async function addInfluencers() {
    setBusy("add");
    try {
      if (c.status !== "ACTIVE") await updateIGCampaignStatusAction(c.id, "ACTIVE");
      const res = await runAgentAction("instagram", { mode: "outreach", campaignId: c.id });
      if (res.ok) {
        const out = res.output as { drafts?: number; discovered?: number; message?: string } | undefined;
        toast.success(
          out?.drafts
            ? `Drafted ${out.drafts} first-DM(s) to new creators`
            : out?.message ?? "Outreach run complete"
        );
        router.refresh();
      } else {
        toast.error("Outreach failed", { description: res.error, duration: 8000 });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h2 className="text-xl font-bold">{c.name}</h2>
            <p className="text-xs text-muted-foreground">
              {c.brand} · Budget ${c.budgetMin.toLocaleString()}–${c.budgetMax.toLocaleString()}
            </p>
          </div>
        </div>
        <Button onClick={addInfluencers} disabled={busy !== null} className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700">
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add Influencers
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("h-2.5 w-2.5 rounded-full", c.autopilot ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          <span className="font-medium">Autopilot {c.autopilot ? "On" : "Off"}</span>
          <span className="text-xs text-muted-foreground">
            {c.autopilot ? "AI auto-reads replies and responds (every ~10 min)." : "Click start — AI will auto-read replies and respond."}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkNow} disabled={busy !== null} className="gap-1.5">
            {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check Now
          </Button>
          <Button
            size="sm"
            onClick={toggleAutopilot}
            disabled={busy !== null}
            className={cn(
              "gap-1.5",
              c.autopilot
                ? ""
                : "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700"
            )}
            variant={c.autopilot ? "outline" : "default"}
          >
            {busy === "autopilot" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : c.autopilot ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {c.autopilot ? "Stop Autopilot" : "Start Autopilot"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats.total} className="text-foreground" />
        <Stat label="Negotiating" value={stats.negotiating} className="text-amber-500" />
        <Stat label="Closed" value={stats.closed} className="text-emerald-500" />
        <Stat label="Rejected" value={stats.rejected} className="text-red-500" />
        <Stat label="Spent" value={`$${stats.spent.toLocaleString()}`} className="text-fuchsia-500" />
      </div>

      <div className="space-y-2">
        {c.negotiations.length === 0 ? (
          <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No influencers yet. Click <strong>Add Influencers</strong> — the AI finds creators and sends the first DM.
          </p>
        ) : (
          c.negotiations.map((n) => {
            const b = statusBadge(n.status);
            return (
              <div key={n.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 text-[11px] font-semibold text-white">
                    {n.handle.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">@{n.handle}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {n.followers.toLocaleString()} followers
                      {n.lastMessage ? ` · ${n.lastRole === "us" ? "→ " : "← "}${n.lastMessage.slice(0, 60)}` : ""}
                    </div>
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", b.cls)}>
                  {b.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3 text-center">
      <div className={cn("text-2xl font-bold tabular-nums", className)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [budgetMin, setBudgetMin] = useState(100);
  const [budgetMax, setBudgetMax] = useState(500);
  const [brief, setBrief] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !brand.trim()) {
      toast.error("Name and brand are required");
      return;
    }
    start(async () => {
      const res = await createIGCampaignAction({ name, brand, budgetMin, budgetMax, brief, autopilot: false });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Campaign created");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Negotiation Campaign</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Campaign Name*</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Germany - Udemy" className="mt-1" />
            </div>
            <div>
              <Label>Brand*</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Udemy" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Budget Min ($)</Label>
              <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label>Budget Max ($)</Label>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Brief / Pitch to creators</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What's the collab about? The AI uses this in the first DM." className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending} className="gap-1.5">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Campaign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

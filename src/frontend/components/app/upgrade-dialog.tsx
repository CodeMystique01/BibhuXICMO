"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { cn } from "@/shared/utils";

type PlanCard = {
  id: "FREE" | "MAX";
  label: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  features: { ok: boolean; label: string }[];
};

const PLANS: PlanCard[] = [
  {
    id: "FREE",
    label: "Free",
    price: "$0",
    cadence: "forever",
    features: [
      { ok: true, label: "2,005 credits / month" },
      { ok: true, label: "All 8 agents" },
      { ok: true, label: "Public site audit, no sign-up" },
      { ok: false, label: "Priority queues" },
      { ok: false, label: "Premium model defaults" },
    ],
  },
  {
    id: "MAX",
    label: "Max",
    price: "$29",
    cadence: "/month",
    highlight: true,
    features: [
      { ok: true, label: "10,000 credits / month" },
      { ok: true, label: "All free features" },
      { ok: true, label: "Premium model defaults (GPT-4o, Claude 3.5)" },
      { ok: true, label: "Priority agent runs + chat queue" },
      { ok: true, label: "Email digests" },
    ],
  },
];

/**
 * In-app upgrade dialog. Drops into anywhere we want to nudge a free user
 * toward Max without a full page nav. Final "Continue" goes to /billing.
 */
export function UpgradeDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Upgrade to Max
          </DialogTitle>
          <DialogDescription>
            {reason ??
              "Unlock priority queues, higher monthly credits, and premium model defaults."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                p.highlight
                  ? "border-primary/40 bg-gradient-to-b from-primary/5 to-transparent"
                  : "bg-muted/20"
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{p.label}</h3>
                {p.highlight ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Recommended
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums">
                  {p.price}
                </span>
                <span className="text-xs text-muted-foreground">{p.cadence}</span>
              </div>
              <ul className="mt-4 space-y-2 text-xs">
                {p.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2">
                    {f.ok ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={f.ok ? "" : "text-muted-foreground"}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button asChild>
            <Link href="/billing">
              <Zap className="h-4 w-4" />
              Continue to Max
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline upgrade trigger. Opens the dialog rather than full-page nav.
 * Good for footer CTAs, banner buttons, etc.
 */
export function UpgradeButton({
  reason,
  className,
  size = "sm",
  variant = "outline",
  label = "Upgrade to Max",
}: {
  reason?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Zap className="h-4 w-4" />
        {label}
      </Button>
      <UpgradeDialog open={open} onOpenChange={setOpen} reason={reason} />
    </>
  );
}

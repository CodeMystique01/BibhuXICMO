"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * Multi-step progress indicator that auto-advances on a fixed cadence.
 *
 * Useful while a long server action is pending so the user sees motion
 * instead of a static spinner. Steps are purely visual — they don't
 * reflect real backend state.
 */
export function ProgressSteps({
  steps,
  intervalMs = 2200,
  className,
}: {
  steps: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (steps.length === 0) return;
    const id = setInterval(() => {
      setActive((n) => Math.min(steps.length - 1, n + 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps.length, intervalMs]);

  return (
    <ol className={cn("space-y-2 text-xs", className)}>
      {steps.map((label, i) => {
        const isDone = i < active;
        const isActive = i === active;
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 transition-colors",
              isDone || isActive ? "text-foreground" : "text-muted-foreground/60"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                isDone && "border-primary/40 bg-primary/15 text-primary",
                isActive && "border-primary/60 bg-primary/10 text-primary",
                !isDone && !isActive && "border-border"
              )}
            >
              {isDone ? (
                <Check className="h-3 w-3" />
              ) : isActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="text-[9px] font-medium">{i + 1}</span>
              )}
            </span>
            <span className="flex-1">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

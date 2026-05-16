import { Sparkles, Zap } from "lucide-react";
import { cn } from "@/shared/utils";

export type Plan = "FREE" | "MAX";

/**
 * Plan badge with color coding and an icon.
 * FREE = muted neutral, MAX = primary gradient.
 */
export function PlanBadge({
  plan,
  className,
}: {
  plan: Plan;
  className?: string;
}) {
  if (plan === "MAX") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary",
          className
        )}
      >
        <Sparkles className="h-3 w-3" />
        Max
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      <Zap className="h-3 w-3" />
      Free
    </span>
  );
}

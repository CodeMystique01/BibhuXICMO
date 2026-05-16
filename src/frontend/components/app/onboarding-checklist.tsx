import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { cn } from "@/shared/utils";

export type ChecklistItem = {
  id: string;
  label: string;
  href: string;
  cta: string;
  done: boolean;
};

/**
 * "Get started" activation checklist for new workspaces. Hidden once every
 * step is done so it doesn't take up dashboard real-estate forever.
 */
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  if (done === total) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <Card className="overflow-hidden border-primary/30 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Get set up</h2>
            <p className="text-xs text-muted-foreground">
              Finish these steps to unlock the full agent loop.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-primary">
              {done}/{total} done · {pct}%
            </div>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center justify-between rounded-md border bg-background/60 px-3 py-2.5 transition-colors",
                item.done
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    item.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border bg-background"
                  )}
                >
                  {item.done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    item.done && "text-muted-foreground line-through"
                  )}
                >
                  {item.label}
                </span>
              </div>
              {!item.done ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {item.cta}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

import { Check, X } from "lucide-react";
import { COST_COMPARISON } from "@/frontend/data/marketing-data";
import { SITE_NAME } from "@/shared/site";

export function CostTable() {
  return (
    <section className="py-24 md:py-32">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
            The $14,000/mo job for $99/mo
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            What {SITE_NAME} replaces vs. what it costs
          </h2>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="grid grid-cols-3 gap-4 border-b bg-muted/40 px-6 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div>What needs doing</div>
            <div className="text-center">Without {SITE_NAME}</div>
            <div className="text-center">With {SITE_NAME}</div>
          </div>

          {COST_COMPARISON.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-3 items-center gap-4 border-b px-6 py-4 text-sm last:border-b-0"
            >
              <div className="font-medium">{row.label}</div>
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                {row.without.includes("not possible") ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : null}
                <span>{row.without}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>{row.withUs}</span>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-3 items-center gap-4 bg-primary/5 px-6 py-5 text-sm font-semibold">
            <div>Total per month</div>
            <div className="text-center text-muted-foreground line-through">
              $14,000+
            </div>
            <div className="text-center text-primary">$99/mo</div>
          </div>
        </div>
      </div>
    </section>
  );
}

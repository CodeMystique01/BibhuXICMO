import Link from "next/link";
import { Pencil, Skull, Zap } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { SITE_NAME } from "@/shared/site";

export function HeaderBar({
  websiteUrl,
  plan,
  credits,
  hasRunsToday,
}: {
  websiteUrl: string | null;
  plan: "FREE" | "MAX";
  credits: number | null;
  hasRunsToday: boolean;
}) {
  const host = websiteUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "—";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-4 py-2 backdrop-blur">
      <Link
        href="/settings#websiteUrl"
        prefetch
        className="group flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
        title="Change website URL"
      >
        <span className="text-muted-foreground">@</span>
        <span className="truncate" title={host}>
          {host}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      <div className="flex items-center gap-2 text-sm">
        <Skull className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{SITE_NAME} terminal</span>
        <Badge
          variant="outline"
          className={
            hasRunsToday
              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/40 text-amber-600 dark:text-amber-400"
          }
        >
          {hasRunsToday ? "Running daily" : "Idle"}
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Zap className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="tabular-nums">{credits ?? 0}</span>
          <span className="text-muted-foreground">credits</span>
        </Badge>
        <Badge variant="outline">{plan} plan</Badge>
        {plan === "FREE" ? (
          <Button size="sm" asChild>
            <Link href="/billing">Upgrade</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

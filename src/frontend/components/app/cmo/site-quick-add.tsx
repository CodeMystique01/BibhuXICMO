"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, Globe, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { clientNormalizeUrl } from "@/shared/normalize-url";
import { updateWorkspaceAction, forceReauditAction } from "@/app/(app)/settings/actions";

/**
 * Inline website-URL entry form embedded in the Company panel.
 *
 * Two modes:
 *   - When the workspace has no websiteUrl yet → renders a permanent input
 *     so the dashboard tells the user exactly what to do first.
 *   - When a URL is already set → renders a small "Change site" pill button
 *     that toggles the input on demand.
 *
 * Submitting calls the existing updateWorkspaceAction (which clears all
 * caches on URL change), then triggers a router.refresh() so every panel
 * — strategy, social pills, PageSpeed, Ahrefs — re-runs against the new
 * site without the user having to navigate anywhere.
 */
export function SiteQuickAdd({
  workspaceName,
  currentUrl,
}: {
  workspaceName: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!currentUrl);
  const [value, setValue] = useState(currentUrl ?? "");
  const [isSaving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const target = clientNormalizeUrl(value);
    if (!target) {
      toast.error("Enter a valid domain", {
        description: "e.g. yoursite.com or https://yoursite.com",
      });
      return;
    }
    startSaving(async () => {
      const fd = new FormData();
      // The settings action expects all four fields. We preserve the
      // existing workspace name and clear industry/icp so the strategy
      // re-runs cleanly for the new site.
      fd.set("name", workspaceName);
      fd.set("websiteUrl", target);
      fd.set("industry", "");
      fd.set("icp", "");
      const res = await updateWorkspaceAction(null, fd);
      if (res && "ok" in res && res.ok) {
        // Same-URL submissions don't trigger updateWorkspaceAction's
        // cache-clear branch — call forceReauditAction so the dashboard
        // always re-runs strategy / Ahrefs / PageSpeed after a save.
        await forceReauditAction();
        toast.success("Site saved — refreshing dashboard", {
          description: "Pulling Ahrefs · Lighthouse · Claude strategy. Takes 30-60s.",
        });
        setOpen(false);
        // Hard reload — bulletproof against React server-component cache, browser
        // bfcache and stale streamed data. router.refresh() was sometimes leaving
        // panels on old workspace data.
        if (typeof window !== "undefined") {
          // Tiny delay so the toast paints before the reload kicks in.
          setTimeout(() => window.location.reload(), 250);
        } else {
          router.refresh();
        }
      } else if (res && "error" in res) {
        toast.error(res.error);
      }
    });
  }

  if (!open) {
    const display = currentUrl
      ? currentUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "")
      : "";
    return (
      <div className="flex items-stretch gap-1.5 rounded-md border bg-card/40 p-1">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted/60">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tracking
          </span>
          <a
            href={currentUrl ?? "#"}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 truncate font-mono text-xs font-medium text-foreground hover:underline"
            title={currentUrl ?? ""}
          >
            <span className="truncate">{display}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-9 shrink-0 gap-1.5 px-2 text-xs"
          title="Switch to a different site"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Change
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Globe className="h-3 w-3" /> Website URL
      </label>
      <div className="flex items-stretch gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="yoursite.com"
          autoComplete="url"
          spellCheck={false}
          disabled={isSaving}
          className="h-9 text-sm"
        />
        <Button type="submit" size="sm" disabled={isSaving || !value.trim()}>
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
        </Button>
        {currentUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(currentUrl);
              setOpen(false);
            }}
            disabled={isSaving}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">
        We&rsquo;ll scrape the homepage, run Lighthouse, fetch Ahrefs
        (DR, backlinks, traffic), and ask Claude to generate strategy +
        social handles. First audit takes ~30-60s.
      </p>
    </form>
  );
}

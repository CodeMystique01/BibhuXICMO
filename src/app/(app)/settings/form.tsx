"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Check, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { clientNormalizeUrl } from "@/shared/normalize-url";
import { updateWorkspaceAction } from "./actions";

type State =
  | { ok: true; resetStrategy?: boolean }
  | { ok: false; error: string }
  | null;

export function WorkspaceSettingsForm({
  workspace,
}: {
  workspace: {
    name: string;
    websiteUrl: string | null;
    industry: string | null;
    icp: string | null;
  };
}) {
  const router = useRouter();
  const [state, action] = useActionState<State, FormData>(
    updateWorkspaceAction,
    null
  );
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState(workspace.websiteUrl ?? "");
  const websiteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      if (state.resetStrategy) {
        toast.success("Website updated", {
          description:
            "Previous strategy and AI cache were cleared for the new URL. Open AI CMO to refresh analysis, or set industry / ICP below.",
        });
      } else {
        toast.success("Saved");
      }
      setSavedAt(new Date());
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  // Auto-focus + highlight the website field when arriving via "?#websiteUrl"
  // (e.g. from the dashboard "change" link or CMO header).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#websiteUrl") return;
    const t = setTimeout(() => {
      websiteRef.current?.focus();
      websiteRef.current?.select();
    }, 60);
    return () => clearTimeout(t);
  }, []);

  const normalizedPreview = clientNormalizeUrl(websiteUrl);
  const showPreview =
    !!normalizedPreview &&
    websiteUrl.trim().length > 0 &&
    normalizedPreview !== websiteUrl.trim();

  return (
    <form
      noValidate
      action={(fd) => {
        const raw = String(fd.get("websiteUrl") || "").trim();
        if (raw) {
          const target = clientNormalizeUrl(raw);
          if (!target) {
            toast.error("That doesn't look like a valid domain", {
              description: "Try yourcompany.com",
            });
            return;
          }
          fd.set("websiteUrl", target);
          if (target !== websiteUrl) setWebsiteUrl(target);
        }
        startTransition(() => action(fd));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Workspace name</Label>
          <Input id="name" name="name" defaultValue={workspace.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="websiteUrl" className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" />
            Website URL
          </Label>
          <Input
            ref={websiteRef}
            id="websiteUrl"
            name="websiteUrl"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            onBlur={() => {
              const target = clientNormalizeUrl(websiteUrl);
              if (target && target !== websiteUrl.trim()) setWebsiteUrl(target);
            }}
            placeholder="yourcompany.com"
          />
          {showPreview ? (
            <p className="text-[11px] text-muted-foreground">
              We&rsquo;ll save{" "}
              <span className="font-mono text-foreground">
                {normalizedPreview}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Change this any time — agents and audits re-target the new URL.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            name="industry"
            defaultValue={workspace.industry ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="icp">Ideal customer profile</Label>
          <Input id="icp" name="icp" defaultValue={workspace.icp ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          className="transition-transform active:scale-[0.99]"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <SaveIndicator savedAt={savedAt} pending={isPending} />
      </div>
    </form>
  );
}

function SaveIndicator({
  savedAt,
  pending,
}: {
  savedAt: Date | null;
  pending: boolean;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [savedAt]);

  if (pending) {
    return (
      <span className="text-xs text-muted-foreground">Saving changes…</span>
    );
  }
  if (!savedAt) return null;

  const diffSec = Math.floor((Date.now() - savedAt.getTime()) / 1000);
  const label =
    diffSec < 5
      ? "just now"
      : diffSec < 60
        ? `${diffSec}s ago`
        : diffSec < 3600
          ? `${Math.floor(diffSec / 60)} min ago`
          : `${Math.floor(diffSec / 3600)}h ago`;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
      <Check className="h-3.5 w-3.5" />
      Saved {label}
    </span>
  );
}

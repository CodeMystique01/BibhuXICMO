"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { ProgressSteps } from "@/frontend/components/ui/progress-steps";
import { clientNormalizeUrl } from "@/shared/normalize-url";
import {
  skipOnboardingAction,
  startOnboardingAction,
  type OnboardResult,
} from "./actions";

const ANALYSIS_STEPS = [
  "Fetching your homepage",
  "Reading your value props",
  "Inferring industry & ICP",
  "Drafting your first actions",
];

export function OnboardingForm() {
  const router = useRouter();
  const [state, action] = useActionState<OnboardResult | null, FormData>(
    startOnboardingAction,
    null
  );
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [progressKey, setProgressKey] = useState(0);

  const normalized = useMemo(() => clientNormalizeUrl(url), [url]);
  const showPreview =
    !!normalized && url.trim().length > 0 && normalized !== url.trim();

  useEffect(() => {
    if (state?.ok) {
      if (state.note) {
        toast.warning("Workspace ready (partial analysis)", {
          description: state.note,
          duration: 8000,
        });
      } else {
        toast.success("Workspace ready", {
          description: "Opening your AI CMO command center.",
        });
      }
      router.push("/agent/cmo");
    } else if (state && !state.ok) {
      toast.error("Analysis issue", { description: state.error });
    }
  }, [state, router]);

  return (
    <form
      noValidate
      action={(fd) => {
        // Normalize before submit so server gets a clean URL even if user typed "site.com".
        const raw = String(fd.get("websiteUrl") || "").trim();
        if (!raw) {
          toast.error("Please enter your website URL", {
            description: "e.g. yourcompany.com",
          });
          return;
        }
        const target = clientNormalizeUrl(raw);
        if (!target) {
          toast.error("That doesn't look like a valid domain", {
            description: "Try something like yourcompany.com",
          });
          return;
        }
        fd.set("websiteUrl", target);
        if (target !== url) setUrl(target);
        setProgressKey((k) => k + 1);
        startTransition(() => action(fd));
      }}
      className="rounded-2xl border bg-card p-8 shadow-sm"
    >
      <div className="space-y-2">
        <Label htmlFor="websiteUrl" className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Your website URL
        </Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            const target = clientNormalizeUrl(url);
            if (target && target !== url.trim()) setUrl(target);
          }}
          placeholder="yourcompany.com"
          autoFocus
          disabled={isPending}
        />
        {showPreview && !isPending ? (
          <p className="text-[11px] text-muted-foreground">
            We&rsquo;ll analyze{" "}
            <span className="font-mono text-foreground">{normalized}</span>
          </p>
        ) : null}
      </div>

      {state && !state.ok && !isPending ? (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-6 w-full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing your site…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Analyze my site
          </>
        )}
      </Button>

      {isPending ? (
        <ProgressSteps key={progressKey} steps={ANALYSIS_STEPS} className="mt-6" />
      ) : (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          This takes 10–30 seconds. We read the page, infer your positioning and ICP,
          and seed your first action items.
        </p>
      )}

      <div className="mt-6 border-t pt-4 text-center">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(() => {
              void skipOnboardingAction();
            });
          }}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          I don&rsquo;t have a website yet — skip this step →
        </button>
      </div>
    </form>
  );
}

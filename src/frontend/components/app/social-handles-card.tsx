"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  AtSign,
  Check,
  Facebook,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Sparkles,
  Twitter,
  Wand2,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import {
  autoDetectSocialHandlesAction,
  saveSocialHandlesAction,
} from "@/app/(app)/settings/actions";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";

type Handles = {
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  youtube?: string;
  github?: string;
  tiktok?: string;
};

const FIELDS: Array<{
  key: keyof Handles;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "twitter", label: "X / Twitter", placeholder: "@yourbrand", icon: Twitter },
  { key: "instagram", label: "Instagram", placeholder: "@yourbrand", icon: Instagram },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/yourbrand", icon: Linkedin },
  { key: "youtube", label: "YouTube", placeholder: "@yourbrand", icon: Youtube },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourbrand", icon: Facebook },
  { key: "github", label: "GitHub", placeholder: "yourorg", icon: Github },
  { key: "tiktok", label: "TikTok", placeholder: "@yourbrand", icon: AtSign },
];

type State = { ok: true } | { ok: false; error: string } | null;

export function SocialHandlesCard({
  initial,
  hasWebsiteUrl,
}: {
  initial: Handles;
  hasWebsiteUrl: boolean;
}) {
  const [values, setValues] = useState<Handles>(initial);
  const [state, action] = useActionState<State, FormData>(
    saveSocialHandlesAction,
    null
  );
  const [isSaving, startSaving] = useTransition();
  const [isDetecting, startDetecting] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Handles saved");
      setSavedAt(new Date());
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  function set<K extends keyof Handles>(k: K, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function autoDetect() {
    if (!hasWebsiteUrl) {
      toast.error("Add a website URL above first, then auto-detect.");
      return;
    }
    startDetecting(async () => {
      const res = await autoDetectSocialHandlesAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Merge into form: only fill fields we previously left blank
      setValues((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(res.handles) as Array<keyof Handles>) {
          const incoming = res.handles[k];
          if (!incoming) continue;
          if (!next[k] || next[k]?.trim() === "") next[k] = incoming;
        }
        return next;
      });
      const found = Object.values(res.handles).filter(Boolean).length;
      if (found === 0) {
        toast.info("Could not find any social handles on the homepage.", {
          description: "Try adding them manually below.",
        });
      } else {
        toast.success(
          `Found ${found} handle${found === 1 ? "" : "s"}${
            res.source === "claude" ? " (via Claude)" : ""
          }`,
          { description: "Review below and save when ready." }
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-primary" />
            Social handles
          </CardTitle>
          <CardDescription>
            Public accounts so agents can learn your voice and route posts.
            Auto-detect pulls them from your homepage with Claude.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={autoDetect}
          disabled={isDetecting || !hasWebsiteUrl}
          title={
            hasWebsiteUrl
              ? "Fetch your homepage and let Claude pick the canonical handles"
              : "Add a website URL above first"
          }
        >
          {isDetecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Detecting…
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5" />
              Auto-detect
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <form
          action={(fd) => {
            for (const f of FIELDS) {
              fd.set(f.key, values[f.key] ?? "");
            }
            startSaving(() => action(fd));
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`handle-${f.key}`} className="flex items-center gap-2 text-xs font-medium">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {f.label}
                  </Label>
                  <Input
                    id={`handle-${f.key}`}
                    name={f.key}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </div>
              );
            })}
          </div>

          {!hasWebsiteUrl ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Add your website URL in the Workspace card above to enable
              one-click auto-detect.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Save handles
                </>
              )}
            </Button>
            {savedAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

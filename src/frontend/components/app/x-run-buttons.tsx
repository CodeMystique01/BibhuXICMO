"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { runAgentAction } from "@/app/(app)/agents/actions";
import { AGENT_META } from "@/shared/agent-meta";

function describeXOutput(output: unknown): string {
  if (!output || typeof output !== "object") return "Run finished.";
  const o = output as {
    drafts?: number;
    surfaced?: number;
    discovered?: number;
    message?: string;
  };
  const parts: string[] = [];
  if (typeof o.drafts === "number") {
    parts.push(
      o.drafts === 0
        ? "No new post drafts"
        : `${o.drafts} post draft(s) created`
    );
  }
  if (typeof o.discovered === "number") {
    parts.push(
      o.discovered === 0
        ? "No tweets in Discovered"
        : `${o.discovered} tweet(s) in Discovered`
    );
  }
  if (typeof o.surfaced === "number") {
    parts.push(
      o.surfaced === 0 ? "No reply drafts" : `${o.surfaced} reply draft(s)`
    );
  }
  if (o.message) parts.push(o.message);
  return parts.join(" · ") || "Run finished.";
}

export function XRunButtons() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cost = AGENT_META.x?.creditsApprox;

  function run(mode: "posts" | "replies", label: string) {
    startTransition(async () => {
      try {
        const res = await runAgentAction("x", {
          mode,
          ...(mode === "posts" ? { forcePosts: true } : {}),
        });
        if (res.ok) {
          toast.success(`${label} completed`, {
            description: describeXOutput(res.output),
            action: {
              label: "View runs",
              onClick: () => router.push("/agents/x"),
            },
          });
          router.refresh();
        } else {
          toast.error(`${label} failed`, {
            description: res.error ?? "Unknown error",
          });
        }
      } catch (err) {
        toast.error(`${label} failed`, {
          description:
            err instanceof Error
              ? err.message
              : "Request timed out or lost connection. Try again in a moment.",
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => run("posts", "Post generation")}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Generate posts
            {cost ? (
              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium opacity-80">
                <Zap className="h-2.5 w-2.5" />≈ {cost}
              </span>
            ) : null}
          </>
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => run("replies", "Reply scan")}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Scan tweets
          </>
        )}
      </Button>
    </div>
  );
}

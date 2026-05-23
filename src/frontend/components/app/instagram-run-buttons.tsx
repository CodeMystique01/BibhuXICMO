"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Search, Sparkles, Users, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { runAgentAction } from "@/app/(app)/agents/actions";
import { AGENT_META } from "@/shared/agent-meta";

function describeIGOutput(output: unknown): string {
  if (!output || typeof output !== "object") return "Run finished.";
  const o = output as {
    drafts?: number;
    surfaced?: number;
    discovered?: number;
    message?: string;
  };
  const parts: string[] = [];
  if (typeof o.drafts === "number") {
    parts.push(o.drafts === 0 ? "No new drafts" : `${o.drafts} draft(s)`);
  }
  if (typeof o.discovered === "number") {
    parts.push(
      o.discovered === 0
        ? "No items in Discovered"
        : `${o.discovered} in Discovered`
    );
  }
  if (typeof o.surfaced === "number") {
    parts.push(
      o.surfaced === 0
        ? "No reply/comment drafts"
        : `${o.surfaced} engagement draft(s)`
    );
  }
  if (o.message) parts.push(o.message);
  return parts.join(" · ") || "Run finished.";
}

type Mode = "posts" | "comments" | "discover" | "outreach";

export function InstagramRunButtons() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cost = AGENT_META.instagram?.creditsApprox;

  function run(mode: Mode, label: string) {
    startTransition(async () => {
      try {
        const res = await runAgentAction("instagram", {
          mode,
          ...(mode === "posts" ? { forcePosts: true } : {}),
        });
        if (res.ok) {
          toast.success(`${label} completed`, {
            description: describeIGOutput(res.output),
            action: {
              label: "View runs",
              onClick: () => router.push("/agents/instagram"),
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

  const baseBtn = (
    children: React.ReactNode,
    onClick: () => void,
    variant: "default" | "outline" = "default"
  ) => (
    <Button size="sm" variant={variant} disabled={isPending} onClick={onClick}>
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Running…
        </>
      ) : (
        children
      )}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {baseBtn(
        <>
          <Sparkles className="h-4 w-4" />
          Generate posts
          {cost ? (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium opacity-80">
              <Zap className="h-2.5 w-2.5" />≈ {cost}
            </span>
          ) : null}
        </>,
        () => run("posts", "Post generation")
      )}
      {baseBtn(
        <>
          <Play className="h-4 w-4" />
          Scan comments
        </>,
        () => run("comments", "Comment scan"),
        "outline"
      )}
      {baseBtn(
        <>
          <Search className="h-4 w-4" />
          Discover posts
        </>,
        () => run("discover", "Discovery"),
        "outline"
      )}
      {baseBtn(
        <>
          <Users className="h-4 w-4" />
          Find creators
        </>,
        () => run("outreach", "Creator discovery"),
        "outline"
      )}
    </div>
  );
}

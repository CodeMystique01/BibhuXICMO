"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Play, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { runAgentAction } from "@/app/(app)/agents/actions";
import { useRouter } from "next/navigation";
import { AGENT_META } from "@/shared/agent-meta";

export function RunAgentButton({
  agentId,
  label = "Run now",
  input,
  size = "default",
  variant = "default",
}: {
  agentId: string;
  label?: string;
  input?: unknown;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const meta = AGENT_META[agentId];
  const cost = meta?.creditsApprox;

  return (
    <Button
      size={size}
      variant={variant}
      disabled={isPending}
      className="transition-transform active:scale-[0.99]"
      onClick={() =>
        startTransition(async () => {
          const res = await runAgentAction(agentId, input);
          if (res.ok) {
            toast.success(`${meta?.label ?? agentId} run completed`, {
              description: "View the latest output below.",
              action: {
                label: "Open actions",
                onClick: () => router.push("/actions"),
              },
            });
            router.refresh();
          } else {
            toast.error(`${meta?.label ?? agentId} run failed`, {
              description: res.error,
            });
          }
        })
      }
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Running…
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          {label}
          {cost ? (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium opacity-80">
              <Zap className="h-2.5 w-2.5" />≈ {cost}
            </span>
          ) : null}
        </>
      )}
    </Button>
  );
}

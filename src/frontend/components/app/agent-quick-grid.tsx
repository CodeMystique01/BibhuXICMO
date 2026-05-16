import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import {
  Bot,
  Code2,
  FileText,
  Hash,
  Linkedin,
  MessageCircle,
  Newspaper,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { listAgentMeta } from "@/shared/agent-meta";
import { RunAgentButton } from "./run-agent-button";

const ICONS: Record<string, LucideIcon> = {
  seo: Search,
  geo: Sparkles,
  content: FileText,
  reddit: MessageCircle,
  hn: Newspaper,
  x: Hash,
  linkedin: Linkedin,
  coding: Code2,
};

/**
 * Compact grid of all agents on the dashboard with a one-click run button
 * and the approximate credit cost so users can budget at a glance.
 */
export function AgentQuickGrid({
  lastRuns,
}: {
  lastRuns: Record<string, { startedAt: string; status: string } | undefined>;
}) {
  const agents = listAgentMeta();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {agents.map((a) => {
        const Icon = ICONS[a.id] ?? Bot;
        const last = lastRuns[a.id];
        return (
          <Card
            key={a.id}
            className="group flex flex-col transition-colors hover:border-primary/40"
          >
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Zap className="h-2.5 w-2.5" />≈ {a.creditsApprox}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">{a.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {a.description}
                </p>
                {last ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Last run: {new Date(last.startedAt).toLocaleDateString()} ·{" "}
                    <span
                      className={
                        last.status === "SUCCESS"
                          ? "text-emerald-500"
                          : last.status === "FAILED"
                            ? "text-destructive"
                            : ""
                      }
                    >
                      {last.status.toLowerCase()}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <RunAgentButton
                  agentId={a.id}
                  size="sm"
                  variant="default"
                  label="Run"
                />
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Open
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

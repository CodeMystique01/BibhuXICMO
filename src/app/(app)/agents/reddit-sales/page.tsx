import { MessageCircle } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { env } from "@/shared/env";
import { RedditAgentClient } from "@/frontend/components/app/reddit/reddit-agent-client";

export const metadata = { title: "Reddit Sales Agent — Xicmo" };
export const dynamic = "force-dynamic";

export default async function RedditSalesPage() {
  await requireWorkspace();
  const apiBase = (env.NEXT_PUBLIC_REDDIT_AGENT_URL ?? "").replace(/\/$/, "") || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card text-primary">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Reddit Sales Agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Find threads worth your time + draft human-style replies and posts.
          </p>
        </div>
      </div>

      <RedditAgentClient apiBase={apiBase} />
    </div>
  );
}

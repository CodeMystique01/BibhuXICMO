/**
 * Vercel Cron: /api/cron/daily
 *
 * Schedule (vercel.json): every day at 06:00 UTC.
 *
 * Strategy:
 * - Always: SEO audit + Reddit scan for every workspace with a website URL.
 * - Once a week (Monday): also runs GEO citation probes.
 * Failures on individual workspaces never abort the whole run.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/backend/db";
import { executeAgent } from "@/backend/agents/base";
import { seoAgent } from "@/backend/agents/seo";
import { geoAgent } from "@/backend/agents/geo";
import { redditAgent } from "@/backend/agents/reddit";
import { isAuthorizedCron } from "@/backend/cron-auth";

export const runtime = "nodejs";
// Vercel allows up to 800 s on Pro for cron; cap at 300 here for safety.
export const maxDuration = 300;

type Result = {
  workspaceId: string;
  seo: "ok" | "skipped" | "error";
  reddit: "ok" | "skipped" | "error";
  geo: "ok" | "skipped" | "error";
  error?: string;
};

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspaces = await prisma.workspace.findMany({
    where: { websiteUrl: { not: null } },
    select: { id: true, websiteUrl: true },
  });

  const isMonday = new Date().getUTCDay() === 1;
  const results: Result[] = [];

  for (const ws of workspaces) {
    const r: Result = {
      workspaceId: ws.id,
      seo: "skipped",
      reddit: "skipped",
      geo: "skipped",
    };
    try {
      const seo = await executeAgent(seoAgent, ws.id, {});
      r.seo = seo.ok ? "ok" : "error";
    } catch {
      r.seo = "error";
    }

    try {
      const reddit = await executeAgent(redditAgent, ws.id, {});
      r.reddit = reddit.ok ? "ok" : "error";
    } catch {
      r.reddit = "error";
    }

    if (isMonday) {
      try {
        const geo = await executeAgent(geoAgent, ws.id, {});
        r.geo = geo.ok ? "ok" : "error";
      } catch {
        r.geo = "error";
      }
    }

    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    runAt: new Date().toISOString(),
    workspacesProcessed: workspaces.length,
    geoIncluded: isMonday,
    results,
  });
}

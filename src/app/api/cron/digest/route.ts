/**
 * Vercel Cron: /api/cron/digest
 *
 * Schedule (vercel.json): every day at 07:00 UTC.
 * Sends each workspace owner a digest of open action items (skips if empty
 * or if RESEND_API_KEY is not configured).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/backend/db";
import { sendEmail, renderDigestEmail } from "@/backend/email";
import { isAuthorizedCron } from "@/backend/cron-auth";
import { env } from "@/shared/env";
import { SITE_NAME } from "@/shared/site";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!env.RESEND_API_KEY) {
    return NextResponse.json({
      ok: false,
      reason: "resend_not_configured",
      sent: 0,
    });
  }

  const workspaces = await prisma.workspace.findMany({
    include: { owner: true },
  });

  let sent = 0;
  for (const ws of workspaces) {
    if (!ws.owner.email) continue;
    const [open, geo, audit] = await Promise.all([
      prisma.actionItem.findMany({
        where: { workspaceId: ws.id, status: "OPEN" },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
      prisma.geoScoreSnapshot.findFirst({
        where: { workspaceId: ws.id },
        orderBy: { date: "desc" },
      }),
      prisma.siteAudit.findFirst({
        where: { workspaceId: ws.id },
        orderBy: { ranAt: "desc" },
      }),
    ]);
    if (open.length === 0) continue;

    const html = renderDigestEmail({
      workspaceName: ws.name,
      actionItems: open.map((a) => ({
        title: a.title,
        summary: a.summary,
        href: a.href,
      })),
      geoScore: geo?.score ?? null,
      seoScore: audit?.score ?? null,
      appUrl: env.APP_URL,
    });

    try {
      await sendEmail({
        to: ws.owner.email,
        subject: `${SITE_NAME} · ${open.length} action items for today`,
        html,
      });
      sent++;
    } catch (err) {
      console.warn("digest send failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    runAt: new Date().toISOString(),
    sent,
  });
}

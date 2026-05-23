/**
 * Instagram outreach + negotiation autopilot.
 *
 *   runIGOutreach(ctx, { campaignId })
 *     1. Discover creators (Apify hashtag + profile scrape)
 *     2. LLM-rank for brand fit, persist to IGCreator
 *     3. For top-N creators in an ACTIVE campaign, draft first DMs as
 *        ContentDraft + IGNegotiation rows. Sending is gated by the user
 *        in the UI (or by the publish flow if Apify cookies + autopilot
 *        are enabled).
 *
 *   runIGNegotiationCycle(ctx)
 *     For every IGNegotiation with autopilot=true and matching active
 *     campaign, poll the IG inbox via Apify → for each new creator reply,
 *     draft a counter-offer. If the LLM marks escalateToHuman=true, the
 *     reply is stored as PENDING_APPROVAL only; otherwise it's enqueued
 *     for auto-send by the worker.
 *
 * Throttle: hard cap of 20 first-DMs / workspace / 24h.
 */
import { prisma } from "@/backend/db";
import type { AgentContext } from "./base";
import { discoverIGCreators } from "./instagram-creators";
import { upsertIGCreator } from "./instagram-db";
import { MIN_IG_CREATOR_FIT } from "./instagram-keywords";
import {
  draftCounterOffer,
  draftFirstDM,
  type CampaignBrief,
  type CreatorBrief,
  type NegotiationTurn,
} from "@/backend/instagram-negotiation";
import { hasIGCookies, loadIGCookies } from "@/backend/ig-cookies";
import {
  apifyPollInbox,
  IGCookiesExpiredError,
} from "@/integrations/instagram-apify-dm";

type VoiceProfile = { tone?: string; positioning?: string };

export const MAX_FIRST_DMS_PER_DAY = 20;
const OUTREACH_TOP_N = 8;

async function dmsSentToday(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.contentDraft.count({
    where: {
      workspaceId,
      agent: "instagram",
      channel: "INSTAGRAM",
      createdAt: { gte: since },
      meta: { path: ["igKind"], equals: "dm_outreach" },
    },
  });
}

export async function runIGOutreach(
  ctx: AgentContext,
  opts: { campaignId?: string } = {}
): Promise<{ drafts: number; discovered: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;

  const campaign = opts.campaignId
    ? await prisma.iGCampaign
        .findFirst({
          where: {
            id: opts.campaignId,
            workspaceId: ctx.workspaceId,
            status: { in: ["ACTIVE", "DRAFT"] },
          },
        })
        .catch(() => null)
    : await prisma.iGCampaign
        .findFirst({
          where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        })
        .catch(() => null);

  if (!campaign) {
    return {
      drafts: 0,
      discovered: 0,
      message:
        "Create an active outreach campaign on /agents/instagram → Campaigns first.",
    };
  }

  const { ranked, niche, scanned, error } = await discoverIGCreators(ctx, voice);
  if (error && ranked.length === 0) {
    return {
      drafts: 0,
      discovered: 0,
      message: error.includes("APIFY")
        ? "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment to enable creator discovery."
        : `Creator discovery failed: ${error}`,
    };
  }

  let discovered = 0;
  let drafts = 0;
  const remainingQuota = Math.max(
    0,
    MAX_FIRST_DMS_PER_DAY - (await dmsSentToday(ctx.workspaceId))
  );

  const brief: CampaignBrief = {
    brand: campaign.brand,
    brief: campaign.brief,
    budgetMin: campaign.budgetMin,
    budgetMax: campaign.budgetMax,
  };

  for (const r of ranked.slice(0, OUTREACH_TOP_N)) {
    if (r.fit < MIN_IG_CREATOR_FIT) continue;

    const creatorRow = await upsertIGCreator({
      workspaceId: ctx.workspaceId,
      handle: r.profile.handle,
      fullName: r.profile.fullName ?? null,
      bio: r.profile.bio ?? null,
      followers: r.profile.followers,
      engagementRate: r.profile.engagementRate ?? null,
      niche,
      profileUrl: r.profile.profileUrl,
      fit: r.fit,
      notes: r.notes,
    });
    if (!creatorRow) continue;
    discovered++;

    // Quota gate — never draft more first-DMs than the daily cap allows.
    if (drafts >= remainingQuota) continue;

    // Don't re-draft if an open negotiation already exists for this creator.
    const existing = await prisma.iGNegotiation
      .findUnique({
        where: {
          campaignId_creatorId: {
            campaignId: campaign.id,
            creatorId: creatorRow.id,
          },
        },
      })
      .catch(() => null);
    if (existing) continue;

    const dm = await draftFirstDM({
      workspaceId: ctx.workspaceId,
      campaign: brief,
      creator: {
        handle: r.profile.handle,
        followers: r.profile.followers,
        niche,
        bio: r.profile.bio,
      },
      voiceTone: voice?.tone,
    });
    if (!dm) continue;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        channel: "INSTAGRAM",
        title: `DM @${r.profile.handle} — ${campaign.name}`,
        body: dm.message,
        meta: {
          igKind: "dm_outreach",
          recipient: r.profile.handle,
          campaignId: campaign.id,
          creatorHandle: r.profile.handle,
          fit: r.fit,
          reasoning: r.notes,
        },
        status: "PENDING_APPROVAL",
      },
    });

    const negotiation = await prisma.iGNegotiation.create({
      data: {
        workspaceId: ctx.workspaceId,
        campaignId: campaign.id,
        creatorId: creatorRow.id,
        status: "PROSPECT",
        autopilot: campaign.autopilot,
        messages: [],
      },
    });

    // Backfill the draft with the negotiationId so the publish flow can update state.
    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: {
        meta: {
          ...(draft.meta as Record<string, unknown>),
          negotiationId: negotiation.id,
        },
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        type: "instagram.outreach",
        title: `Review DM to @${r.profile.handle}`,
        summary: `Fit ${Math.round(r.fit * 100)}% · ${r.notes.slice(0, 160)}`,
        cta: "Review",
        href: `/content/${draft.id}`,
        priority: r.fit > 0.8 ? "HIGH" : "MEDIUM",
        meta: { campaignId: campaign.id, creatorId: creatorRow.id },
      },
    });

    drafts++;
  }

  const quotaNote =
    drafts >= remainingQuota && ranked.some((r) => r.fit >= MIN_IG_CREATOR_FIT)
      ? ` Daily DM quota (${MAX_FIRST_DMS_PER_DAY}) reached — remaining creators saved without drafts.`
      : "";

  return {
    drafts,
    discovered,
    message:
      drafts === 0 && discovered === 0
        ? `Scanned ${scanned} creators across the planned hashtags — none cleared the ${Math.round(MIN_IG_CREATOR_FIT * 100)}% fit threshold.`
        : quotaNote || undefined,
  };
}

// --------------------------------------------------------------------------
// Negotiation autopilot — polls inbox, drafts counter-offers
// --------------------------------------------------------------------------
export async function runIGNegotiationCycle(
  ctx: AgentContext
): Promise<{ surfaced: number; message?: string }> {
  if (!(await hasIGCookies(ctx.workspaceId))) {
    return {
      surfaced: 0,
      message:
        "Instagram session cookies not configured. Add them in the Negotiations tab to enable autopilot.",
    };
  }

  const negotiations = await prisma.iGNegotiation
    .findMany({
      where: {
        workspaceId: ctx.workspaceId,
        autopilot: true,
        status: { in: ["DM_SENT", "REPLIED", "NEGOTIATING"] },
        campaign: { is: { status: "ACTIVE" } },
      },
      include: { creator: true, campaign: true },
      take: 25,
    })
    .catch(() => []);

  if (negotiations.length === 0) {
    return {
      surfaced: 0,
      message: "No active negotiations with autopilot enabled.",
    };
  }

  const cookies = await loadIGCookies(ctx.workspaceId);
  if (!cookies) {
    return { surfaced: 0, message: "IG cookies are missing or unreadable." };
  }

  let inbox: Awaited<ReturnType<typeof apifyPollInbox>>;
  try {
    inbox = await apifyPollInbox(cookies, { limit: 60 });
  } catch (err) {
    if (err instanceof IGCookiesExpiredError) {
      await prisma.iGNegotiation.updateMany({
        where: {
          workspaceId: ctx.workspaceId,
          autopilot: true,
          status: { in: ["DM_SENT", "REPLIED", "NEGOTIATING"] },
        },
        data: { autopilot: false },
      });
      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "instagram",
          type: "instagram.cookies_expired",
          title: "Instagram cookies expired — autopilot paused",
          summary:
            "Re-add your IG session cookies on /agents/instagram to resume the negotiation autopilot.",
          cta: "Fix cookies",
          href: "/agents/instagram?tab=campaigns",
          priority: "HIGH",
        },
      });
      return {
        surfaced: 0,
        message: "IG cookies rejected — autopilot paused for safety.",
      };
    }
    throw err;
  }

  let surfaced = 0;
  for (const n of negotiations) {
    const newMessages = inbox.filter(
      (m) =>
        !m.isFromUs &&
        m.fromHandle.toLowerCase() === n.creator.handle.toLowerCase()
    );
    if (newMessages.length === 0) continue;

    const prior = (n.messages as NegotiationTurn[] | null) ?? [];
    const newest = newMessages
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((m) => ({
        role: "creator" as const,
        text: m.text,
        sentAt: m.timestamp,
      }));

    const history: NegotiationTurn[] = [...prior, ...newest];

    const offer = await draftCounterOffer({
      workspaceId: ctx.workspaceId,
      campaign: {
        brand: n.campaign.brand,
        brief: n.campaign.brief,
        budgetMin: n.campaign.budgetMin,
        budgetMax: n.campaign.budgetMax,
      },
      creator: {
        handle: n.creator.handle,
        followers: n.creator.followers,
        niche: n.creator.niche,
        bio: n.creator.bio,
      },
      history,
      voiceTone: (ctx.voiceProfile as VoiceProfile | null)?.tone,
    });
    if (!offer) continue;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        channel: "INSTAGRAM",
        title: `Counter @${n.creator.handle} ($${offer.proposedPrice})`,
        body: offer.message,
        meta: {
          igKind: "dm_negotiation",
          recipient: n.creator.handle,
          campaignId: n.campaignId,
          negotiationId: n.id,
          proposedPrice: offer.proposedPrice,
          escalateToHuman: offer.escalateToHuman,
          reasoning: offer.reasoning,
        },
        status: offer.escalateToHuman ? "PENDING_APPROVAL" : "SCHEDULED",
        scheduledAt: offer.escalateToHuman ? null : new Date(),
      },
    });

    // If not escalated, enqueue an immediate ScheduledPost so the worker sends it.
    if (!offer.escalateToHuman) {
      await prisma.scheduledPost.create({
        data: {
          workspaceId: ctx.workspaceId,
          draftId: draft.id,
          channel: "INSTAGRAM",
          scheduledAt: new Date(),
          status: "pending",
        },
      });
    }

    await prisma.iGNegotiation.update({
      where: { id: n.id },
      data: {
        status: "NEGOTIATING",
        lastMessageAt: new Date(),
        agreedPrice: offer.escalateToHuman ? n.agreedPrice : offer.proposedPrice,
        messages: history.concat({
          role: "us",
          text: offer.message,
          sentAt: new Date().toISOString(),
        }) as never,
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        type: offer.escalateToHuman
          ? "instagram.negotiation_escalation"
          : "instagram.negotiation_update",
        title: offer.escalateToHuman
          ? `Approve counter to @${n.creator.handle}`
          : `Counter sent to @${n.creator.handle}`,
        summary: offer.reasoning.slice(0, 200),
        cta: "View",
        href: `/content/${draft.id}`,
        priority: offer.escalateToHuman ? "HIGH" : "LOW",
      },
    });

    surfaced++;
  }

  return {
    surfaced,
    message:
      surfaced === 0
        ? "No new creator replies in the IG inbox."
        : undefined,
  };
}

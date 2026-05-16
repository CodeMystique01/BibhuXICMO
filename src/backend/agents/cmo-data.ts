/**
 * Aggregator for the AI CMO command center page.
 *
 * Two-phase API:
 *   - `loadCmoFastData()` — DB only (~50-200ms). Drives the page shell.
 *   - `loadCmoSlowData()` — live homepage scrape + PageSpeed + GA4/GSC
 *     (1-15s). Streamed in via React Suspense so the shell renders instantly.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import { fetchPage, type PageSnapshot } from "@/backend/scraper/fetch";
import { fetchPageSpeed, type PageSpeedResult } from "@/backend/pagespeed";
import {
  listGSCSites,
  listGA4Properties,
  querySearchAnalytics,
  runGA4Report,
} from "@/integrations/google";
import {
  generateCmoLlmAnalysis,
  parseCmoLlmSnapshot,
  toStoredSnapshot,
  type CmoLlmAnalysis,
} from "@/backend/pipelines/cmo-llm-analysis.pipeline";
import { strategyPipeline } from "@/backend/pipelines/strategy.pipeline";

export type { CmoLlmAnalysis };

const CMO_LLM_CACHE_MS = 24 * 60 * 60 * 1000;

export type CmoVoiceProfile = {
  positioning?: string;
  valueProps?: string[];
  competitors?: string[];
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  channels?: string[];
  siteTitle?: string;
  siteDescription?: string;
  brandVoice?: { tone?: string; style?: string; avoid?: string[] };
  /** Spread from onboarding strategy.voice */
  tone?: string;
  styleGuidelines?: string[];
  avoid?: string[];
  /**
   * Public social-media handles for the brand. Auto-detected from the
   * website (Claude + regex pre-scan) or manually edited in /settings.
   */
  socialHandles?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    facebook?: string;
    youtube?: string;
    github?: string;
    tiktok?: string;
  };
};

export type SeoIssue = {
  severity: "low" | "medium" | "high";
  category: string;
  title: string;
  fix: string;
  url?: string;
};

export type ActionLite = {
  id: string;
  title: string;
  summary: string | null;
  agent: string;
  priority: string;
  cta: string | null;
  href: string | null;
  createdAt: Date;
};

export type RunLite = {
  id: string;
  agent: string;
  status: string;
  startedAt: Date;
};

export type GscRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type Ga4Row = {
  page: string;
  sessions: number;
  users: number;
  conversions: number;
};

/** Data we can have ready in <200ms from the DB only. */
export type CmoFastData = {
  workspace: {
    id: string;
    name: string;
    websiteUrl: string | null;
    industry: string | null;
    icp: string | null;
  };
  plan: "FREE" | "MAX";
  credits: number | null;
  voice: CmoVoiceProfile | null;
  integrations: {
    ga4: boolean;
    gsc: boolean;
    reddit: boolean;
    twitter: boolean;
    linkedin: boolean;
    github: boolean;
  };
  scores: {
    seo: number | null;
    geo: number | null;
  };
  topIssues: SeoIssue[];
  topKeywords: Array<{ query: string; intent: string | null }>;
  topCompetitors: string[];
  openActions: ActionLite[];
  recentRuns: RunLite[];
};

/** Data that requires live network calls. Streamed in via Suspense. */
export type CmoSlowData = {
  liveSnapshot: PageSnapshot | null;
  pageSpeed: PageSpeedResult | null;
  gsc: { connected: boolean; rows: GscRow[]; site: string | null };
  ga4: { connected: boolean; rows: Ga4Row[]; property: string | null };
  /** Homepage-only LLM analysis (one provider key). Cached on Workspace.cmoLlmSnapshot. */
  llmAnalysis: CmoLlmAnalysis | null;
  /**
   * If voiceProfile was empty when the page started loading (e.g. right after
   * the user changed their site URL), we lazily regenerate the strategy here
   * so the Company panel populates competitors / positioning / channels on
   * the same page render instead of forcing the user to re-run an agent.
   */
  freshVoice: CmoVoiceProfile | null;
  freshIndustry: string | null;
  freshIcp: string | null;
};

/** Combined view (used after both phases resolve). */
export type CmoData = CmoFastData & CmoSlowData;

export async function loadCmoFastData(args: {
  workspaceId: string;
  websiteUrl: string | null;
  workspaceName: string;
  industry: string | null;
  icp: string | null;
  voiceProfile: unknown;
  plan: "FREE" | "MAX";
  credits: number | null;
}): Promise<CmoFastData> {
  const voice = (args.voiceProfile ?? null) as CmoVoiceProfile | null;

  const [
    integrations,
    latestAudit,
    latestGeo,
    keywords,
    openActions,
    recentRuns,
  ] = await Promise.all([
    prisma.integration.findMany({
      where: { workspaceId: args.workspaceId },
      select: { provider: true },
    }),
    prisma.siteAudit.findFirst({
      where: { workspaceId: args.workspaceId },
      orderBy: { ranAt: "desc" },
    }),
    prisma.geoScoreSnapshot.findFirst({
      where: { workspaceId: args.workspaceId },
      orderBy: { date: "desc" },
    }),
    prisma.keyword.findMany({
      where: { workspaceId: args.workspaceId },
      orderBy: { trackedSince: "desc" },
      take: 8,
      select: { query: true, intent: true },
    }),
    prisma.actionItem.findMany({
      where: { workspaceId: args.workspaceId, status: "OPEN" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: args.workspaceId },
      orderBy: { startedAt: "desc" },
      take: 12,
      select: { id: true, agent: true, status: true, startedAt: true },
    }),
  ]);

  const integrationSet = new Set(integrations.map((i) => i.provider));
  const topIssues: SeoIssue[] = Array.isArray(latestAudit?.issues)
    ? (latestAudit.issues as unknown[])
        .filter((x): x is SeoIssue => isIssue(x))
        .slice(0, 12)
    : [];

  const topCompetitors = Array.isArray(voice?.competitors)
    ? voice.competitors.slice(0, 6)
    : [];

  return {
    workspace: {
      id: args.workspaceId,
      name: args.workspaceName,
      websiteUrl: args.websiteUrl,
      industry: args.industry,
      icp: args.icp,
    },
    plan: args.plan,
    credits: args.credits,
    voice,
    integrations: {
      ga4: integrationSet.has("GOOGLE_ANALYTICS"),
      gsc: integrationSet.has("GOOGLE_SEARCH_CONSOLE"),
      reddit: integrationSet.has("REDDIT"),
      twitter: integrationSet.has("TWITTER"),
      linkedin: integrationSet.has("LINKEDIN"),
      github: integrationSet.has("GITHUB"),
    },
    scores: {
      seo: latestAudit?.score ?? null,
      geo: latestGeo?.score ?? null,
    },
    topIssues,
    topKeywords: keywords,
    topCompetitors,
    openActions: openActions.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary,
      agent: a.agent,
      priority: a.priority,
      cta: a.cta,
      href: a.href,
      createdAt: a.createdAt,
    })),
    recentRuns,
  };
}

export async function loadCmoSlowData(args: {
  workspaceId: string;
  websiteUrl: string | null;
  industry: string | null;
  icp: string | null;
  voice?: CmoVoiceProfile | null;
  ga4Connected: boolean;
  gscConnected: boolean;
  withPageSpeed?: boolean;
}): Promise<CmoSlowData> {
  const {
    websiteUrl,
    industry,
    icp,
    voice,
    ga4Connected,
    gscConnected,
    withPageSpeed = true,
  } = args;

  const [liveSnapshot, pageSpeed, gscData, ga4Data] = await Promise.all([
    websiteUrl ? fetchPage(websiteUrl).catch(() => null) : Promise.resolve(null),
    withPageSpeed && websiteUrl
      ? fetchPageSpeed(websiteUrl).catch(() => null)
      : Promise.resolve(null),
    gscConnected ? loadGsc(args.workspaceId) : Promise.resolve(null),
    ga4Connected ? loadGa4(args.workspaceId) : Promise.resolve(null),
  ]);

  let llmAnalysis: CmoLlmAnalysis | null = null;
  try {
    llmAnalysis = await resolveCmoLlmAnalysis({
      workspaceId: args.workspaceId,
      websiteUrl,
      industry,
      icp,
      liveSnapshot,
    });
  } catch (err) {
    console.error("[cmo] resolveCmoLlmAnalysis failed:", err);
  }

  // Lazy strategy refresh — runs when the workspace has a URL but no voice
  // profile yet (e.g. user just changed the site in Settings, which clears
  // voice + cached snapshot). Failures are non-fatal: we just leave voice
  // unset and the user can re-run agents manually.
  let freshVoice: CmoVoiceProfile | null = null;
  let freshIndustry: string | null = null;
  let freshIcp: string | null = null;
  if (websiteUrl && isVoiceEmpty(voice ?? null)) {
    try {
      const { strategy, snapshot } = await strategyPipeline.generate({
        workspaceId: args.workspaceId,
        websiteUrl,
      });
      freshVoice = {
        ...strategy.voice,
        positioning: strategy.positioning,
        valueProps: strategy.valueProps,
        competitors: strategy.competitors,
        topicClusters: strategy.topicClusters,
        channels: strategy.channels,
        siteTitle: snapshot.title,
        siteDescription: snapshot.description,
      };
      freshIndustry = strategy.industry;
      freshIcp = strategy.icp;

      try {
        await prisma.workspace.update({
          where: { id: args.workspaceId },
          data: {
            industry: freshIndustry,
            icp: freshIcp,
            voiceProfile: JSON.parse(
              JSON.stringify(freshVoice)
            ) as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        console.error("[cmo] failed to persist regenerated strategy:", err);
      }
    } catch (err) {
      console.error("[cmo] lazy strategy regen failed:", err);
    }
  }

  return {
    liveSnapshot,
    pageSpeed,
    gsc: gscData ?? { connected: gscConnected, rows: [], site: null },
    ga4: ga4Data ?? { connected: ga4Connected, rows: [], property: null },
    llmAnalysis,
    freshVoice,
    freshIndustry,
    freshIcp,
  };
}

function isVoiceEmpty(voice: CmoVoiceProfile | null): boolean {
  if (!voice) return true;
  const hasCompetitors = Array.isArray(voice.competitors) && voice.competitors.length > 0;
  const hasValueProps = Array.isArray(voice.valueProps) && voice.valueProps.length > 0;
  const hasPositioning = !!(voice.positioning && voice.positioning.trim().length > 0);
  return !hasCompetitors && !hasValueProps && !hasPositioning;
}

async function resolveCmoLlmAnalysis(args: {
  workspaceId: string;
  websiteUrl: string | null;
  industry: string | null;
  icp: string | null;
  liveSnapshot: PageSnapshot | null;
}): Promise<CmoLlmAnalysis | null> {
  const { workspaceId, websiteUrl, industry, icp, liveSnapshot } = args;
  if (!websiteUrl || !liveSnapshot || liveSnapshot.status >= 400) {
    return null;
  }

  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { cmoLlmSnapshot: true },
  });

  const cached = parseCmoLlmSnapshot(
    row?.cmoLlmSnapshot,
    websiteUrl,
    CMO_LLM_CACHE_MS
  );
  if (cached) return cached;

  const fresh = await generateCmoLlmAnalysis({
    workspaceId,
    websiteUrl,
    industry,
    icp,
    snapshot: liveSnapshot,
  });
  if (!fresh) return null;

  try {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        cmoLlmSnapshot: toStoredSnapshot(websiteUrl, fresh) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[cmo] cache cmoLlmSnapshot failed (migrate DB?):", err);
  }

  return fresh;
}

/** Backwards-compatible single-shot loader (fast + slow). */
export async function loadCmoData(args: {
  workspaceId: string;
  websiteUrl: string | null;
  workspaceName: string;
  industry: string | null;
  icp: string | null;
  voiceProfile: unknown;
  plan: "FREE" | "MAX";
  credits: number | null;
  withPageSpeed?: boolean;
}): Promise<CmoData> {
  const fast = await loadCmoFastData(args);
  const slow = await loadCmoSlowData({
    workspaceId: args.workspaceId,
    websiteUrl: args.websiteUrl,
    industry: args.industry,
    icp: args.icp,
    voice: fast.voice,
    ga4Connected: fast.integrations.ga4,
    gscConnected: fast.integrations.gsc,
    withPageSpeed: args.withPageSpeed,
  });
  return { ...fast, ...slow };
}

async function loadGsc(
  workspaceId: string
): Promise<CmoSlowData["gsc"]> {
  try {
    const sites = await listGSCSites(workspaceId);
    if (sites.length === 0) return { connected: true, rows: [], site: null };
    const site = sites[0];
    const rows = await querySearchAnalytics(workspaceId, site.siteUrl, {
      dimensions: ["query"],
      rowLimit: 25,
    });
    return {
      connected: true,
      site: site.siteUrl,
      rows: rows.map((r) => ({
        query: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
    };
  } catch {
    return { connected: true, rows: [], site: null };
  }
}

async function loadGa4(
  workspaceId: string
): Promise<CmoSlowData["ga4"]> {
  try {
    const props = await listGA4Properties(workspaceId);
    if (props.length === 0)
      return { connected: true, rows: [], property: null };
    const prop = props[0];
    const rows = await runGA4Report(workspaceId, prop.name, {
      dimensions: ["pagePath"],
      metrics: ["sessions", "activeUsers", "conversions"],
      limit: 15,
    });
    return {
      connected: true,
      property: prop.displayName,
      rows: rows.map((r) => ({
        page: r.dimensions[0] ?? "/",
        sessions: r.metrics[0] ?? 0,
        users: r.metrics[1] ?? 0,
        conversions: r.metrics[2] ?? 0,
      })),
    };
  } catch {
    return { connected: true, rows: [], property: null };
  }
}

function isIssue(x: unknown): x is SeoIssue {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.fix === "string" &&
    typeof o.category === "string" &&
    (o.severity === "low" || o.severity === "medium" || o.severity === "high")
  );
}

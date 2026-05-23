/**
 * Tools the AI CMO chat can call. Each one wraps an existing
 * agent / scraper so the chat experience matches the dashboard.
 *
 * The tools are intentionally narrow: they all run on the user's
 * own workspace, never accept secrets, and never make outbound writes
 * unless the matching agent itself does (via the standard publish flow).
 */
import { z } from "zod";
import { tool } from "ai";
import { prisma } from "@/backend/db";
import { fetchPage, normalizeUrl } from "@/backend/scraper/fetch";
import { fetchPageSpeed } from "@/backend/pagespeed";
import { searchReddit } from "@/integrations/reddit";
import { searchHN } from "@/integrations/hackernews";
import { runHNPostGeneration } from "@/backend/agents/hn";
import { executeAgent } from "@/backend/agents/base";
import { seoAgent } from "@/backend/agents/seo";
import { geoAgent } from "@/backend/agents/geo";
import { contentAgent } from "@/backend/agents/content";
import { xAgent } from "@/backend/agents/x";
import { linkedinAgent } from "@/backend/agents/linkedin";
import { listGSCSites, querySearchAnalytics } from "@/integrations/google";
import { CMO_PREFERRED_MODEL } from "@/backend/llm";

const MAX_TEXT = 4_000;

const CMO_AGENT_OPTS = { preferredModel: CMO_PREFERRED_MODEL };

export function buildCmoTools(workspaceId: string) {
  return {
    analyze_url: tool({
      description:
        "Fetch a URL, parse its on-page metadata, run a Lighthouse PageSpeed audit (mobile + desktop), and return everything. Use this whenever the user pastes a URL or asks you to look at a page.",
      parameters: z.object({
        url: z.string().describe("Full URL or domain. Will be normalized."),
        includePageSpeed: z
          .boolean()
          .default(true)
          .describe("Whether to also run Lighthouse via Google PageSpeed Insights."),
      }),
      execute: async ({ url, includePageSpeed }) => {
        try {
          const normalized = normalizeUrl(url);
          const snap = await fetchPage(normalized);
          const ps = includePageSpeed ? await fetchPageSpeed(normalized) : null;
          return {
            ok: true,
            url: normalized,
            status: snap.status,
            title: snap.title,
            description: snap.description,
            h1: snap.h1,
            h2: snap.h2.slice(0, 12),
            wordCount: snap.wordCount,
            lang: snap.lang,
            imagesTotal: snap.images.length,
            imagesMissingAlt: snap.images.filter((i) => !i.alt).length,
            jsonLdBlocks: snap.jsonLd.length,
            internalLinks: snap.links.filter((l) => l.internal).length,
            externalLinks: snap.links.filter((l) => !l.internal).length,
            sampleText: snap.text.slice(0, MAX_TEXT),
            pageSpeed: ps,
          };
        } catch (err) {
          return {
            ok: false,
            url,
            error: err instanceof Error ? err.message : "fetch_failed",
          };
        }
      },
    }),

    run_seo_agent: tool({
      description:
        "Run the full SEO agent on the workspace's website. Performs a live audit, scores the site 0-100, and writes issues + opportunities + content ideas into the action feed. Use when the user asks for an SEO audit, score, or recommendations.",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeAgent(seoAgent, workspaceId, {}, CMO_AGENT_OPTS);
        return result;
      },
    }),

    run_geo_agent: tool({
      description:
        "Run the GEO (Generative Engine Optimization) agent. Probes multiple LLM providers with realistic queries to measure how often the brand is cited and which competitors are cited instead.",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeAgent(geoAgent, workspaceId, {}, CMO_AGENT_OPTS);
        return result;
      },
    }),

    write_article: tool({
      description:
        "Draft a long-form blog or landing page article in the brand voice. Persists the draft as PENDING_APPROVAL.",
      parameters: z.object({
        topic: z.string(),
        angle: z.string().optional(),
        targetKeyword: z.string().optional(),
        wordCount: z.number().int().min(400).max(3000).optional(),
        format: z.enum(["blog", "landing_page"]).default("blog"),
      }),
      execute: async ({ topic, angle, targetKeyword, wordCount, format }) => {
        return executeAgent(
          contentAgent,
          workspaceId,
          {
            channel: format,
            topic,
            angle,
            targetKeyword,
            wordCount,
          },
          CMO_AGENT_OPTS
        );
      },
    }),

    draft_x_post: tool({
      description:
        "Draft a tweet or thread for X (Twitter) in the brand voice. Persists the draft as PENDING_APPROVAL.",
      parameters: z.object({
        topic: z.string(),
        mode: z.enum(["single", "thread"]).default("thread"),
        angle: z.string().optional(),
      }),
      execute: async ({ topic, mode, angle }) => {
        return executeAgent(xAgent, workspaceId, { topic, mode, angle }, CMO_AGENT_OPTS);
      },
    }),

    draft_linkedin_post: tool({
      description:
        "Draft a LinkedIn post in the brand voice. Persists the draft as PENDING_APPROVAL.",
      parameters: z.object({
        topic: z.string(),
        angle: z.string().optional(),
      }),
      execute: async ({ topic, angle }) => {
        return executeAgent(
          linkedinAgent,
          workspaceId,
          { topic, angle },
          CMO_AGENT_OPTS
        );
      },
    }),

    find_reddit_threads: tool({
      description:
        "Search Reddit for threads matching a keyword. Public read API, no Reddit OAuth required. Use to surface community discussions worth engaging with.",
      parameters: z.object({
        query: z.string(),
        subreddit: z.string().optional(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ query, subreddit, limit }) => {
        try {
          const results = await searchReddit(query, { subreddit, limit });
          return {
            ok: true,
            count: results.length,
            threads: results.slice(0, limit).map((r) => ({
              subreddit: r.subreddit,
              title: r.title,
              score: r.score,
              comments: r.num_comments,
              url: `https://www.reddit.com${r.permalink}`,
              excerpt: r.selftext?.slice(0, 280) ?? "",
            })),
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "reddit_failed",
          };
        }
      },
    }),

    find_hn_threads: tool({
      description:
        "Search Hacker News (Algolia) for stories matching a keyword. No API key required.",
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(10),
        byDate: z.boolean().default(true).describe("Prefer recent stories"),
      }),
      execute: async ({ query, limit, byDate }) => {
        try {
          const results = await searchHN(query, { limit, byDate });
          return {
            ok: true,
            count: results.length,
            stories: results.map((s) => ({
              title: s.title,
              points: s.points,
              comments: s.num_comments,
              url: s.url ?? `https://news.ycombinator.com/item?id=${s.objectID}`,
              hnUrl: `https://news.ycombinator.com/item?id=${s.objectID}`,
            })),
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "hn_failed",
          };
        }
      },
    }),

    draft_hn_posts: tool({
      description:
        "Generate Show HN and Ask HN post drafts for this workspace (saved to content library). No HN API key required.",
      parameters: z.object({}),
      execute: async () => {
        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (!workspace) return { ok: false, error: "workspace_not_found" };
        const ctx = {
          workspaceId,
          websiteUrl: workspace.websiteUrl,
          industry: workspace.industry,
          icp: workspace.icp,
          voiceProfile: workspace.voiceProfile,
          preferredModel: CMO_PREFERRED_MODEL,
        };
        try {
          const { generated } = await runHNPostGeneration(ctx, { skipIfRecent: false });
          return { ok: true, generated };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "hn_posts_failed",
          };
        }
      },
    }),

    gsc_top_queries: tool({
      description:
        "Pull top Google Search Console queries (last 30 days). Requires the workspace to have connected Google Search Console; returns an empty list otherwise.",
      parameters: z.object({
        rowLimit: z.number().int().min(5).max(100).default(25),
      }),
      execute: async ({ rowLimit }) => {
        const sites = await listGSCSites(workspaceId);
        if (sites.length === 0) {
          return {
            ok: false,
            connected: false,
            note: "Google Search Console is not connected for this workspace.",
          };
        }
        const site = sites[0];
        const rows = await querySearchAnalytics(workspaceId, site.siteUrl, {
          dimensions: ["query"],
          rowLimit,
        });
        return {
          ok: true,
          connected: true,
          site: site.siteUrl,
          rows: rows.map((r) => ({
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          })),
        };
      },
    }),
  };
}

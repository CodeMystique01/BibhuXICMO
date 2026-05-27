import { z } from "zod";
import { prisma } from "@/backend/db";
import {
  meteredGenerateObject,
  pickAvailableModel,
  listAvailableProviders,
  DEFAULT_MODEL,
} from "@/backend/llm";
import { probeAiOverview } from "./geo-aio-probe";
import type { Agent, AgentContext } from "./base";

const probeSchema = z.object({
  mentioned: z.boolean(),
  cited: z.boolean(),
  competitors: z.array(z.string()).max(10),
  summary: z.string(),
});

export type GeoAuditResult = {
  score: number;
  breakdown: Array<{
    provider: string;
    prompt: string;
    cited: boolean;
    mentioned: boolean;
    competitors: string[];
  }>;
};

const SYSTEM = `You are a factual research assistant. Answer the user's question as you normally would. Then, in a hidden analysis, note every brand or product name you cited or could have cited.`;

export const geoAgent: Agent<unknown, GeoAuditResult> = {
  id: "geo",
  title: "GEO Agent",
  schedule: "0 4 * * 1", // weekly Monday 04:00 UTC
  minCredits: 2,
  async run(ctx: AgentContext): Promise<GeoAuditResult> {
    if (!ctx.websiteUrl) throw new Error("Workspace has no website URL");

    const brandName = inferBrandName(ctx.websiteUrl);
    const prompts = await buildProbes(ctx, brandName);

    let providers = listAvailableProviders();
    if (ctx.preferredModel) {
      const firstModel = pickAvailableModel(ctx.preferredModel);
      if (firstModel) {
        providers = [firstModel, ...providers.filter((p) => p !== firstModel)];
      }
    }
    if (providers.length === 0) {
      const fallback = pickAvailableModel(ctx.preferredModel ?? DEFAULT_MODEL);
      if (fallback) providers.push(fallback);
    }
    const breakdown: GeoAuditResult["breakdown"] = [];

    for (const prompt of prompts) {
      for (const provider of providers) {
        const model = pickAvailableModel(provider);
        if (!model) continue; // no key for this provider

        try {
          const { object } = await meteredGenerateObject(
            `Question: ${prompt}\n\nAnswer the question, then evaluate: does a comprehensive answer naturally cite "${brandName}" (or its domain ${ctx.websiteUrl})? If so, mark cited=true. Also list up to 5 competing brands typically cited for this query.`,
            probeSchema,
            {
              workspaceId: ctx.workspaceId,
              reason: "geo.probe",
              model,
              system: SYSTEM,
            }
          );

          await prisma.geoQuery.create({
            data: {
              workspaceId: ctx.workspaceId,
              prompt,
              provider: model,
              cited: object.cited,
              snippet: object.summary,
              rawResponse: JSON.parse(JSON.stringify(object)),
            },
          });

          breakdown.push({
            provider: model,
            prompt,
            cited: object.cited,
            mentioned: object.mentioned,
            competitors: object.competitors,
          });
        } catch (err) {
          console.warn("GEO probe failed:", err);
        }
      }
    }

    // ----------------------------------------------------------------------
    // AI Overviews probe via Apify Google SERP (no extra API key needed —
    // uses the existing APIFY_SEO_TOKEN / APIFY_TOKEN). Each prompt gets a
    // single Google search; if Google shows an AI Overview that cites our
    // domain, we record it as a `geoQuery` with provider "ai_overviews".
    // Failures are non-fatal — the rest of the run still finishes.
    // ----------------------------------------------------------------------
    if (ctx.websiteUrl) {
      await Promise.all(
        prompts.map(async (prompt) => {
          try {
            const aio = await probeAiOverview({
              query: prompt,
              domain: ctx.websiteUrl!,
            });
            if (!aio) return; // Apify not configured — silently skip.

            await prisma.geoQuery.create({
              data: {
                workspaceId: ctx.workspaceId,
                prompt,
                provider: "ai_overviews",
                cited: aio.cited,
                snippet: aio.snippet || (aio.hasOverview ? "AIO present" : "no AIO"),
                rawResponse: {
                  sources: aio.sources,
                  hasOverview: aio.hasOverview,
                },
              },
            });
            breakdown.push({
              provider: "ai_overviews",
              prompt,
              cited: aio.cited,
              mentioned: aio.cited,
              competitors: [],
            });
          } catch (err) {
            console.warn("[geo] AIO probe failed for prompt:", prompt, err);
          }
        })
      );
    }

    // Score = percent of probes where cited=true, plus a smaller weight for mentions.
    const count = breakdown.length || 1;
    const citedCount = breakdown.filter((b) => b.cited).length;
    const mentionedCount = breakdown.filter((b) => b.mentioned && !b.cited).length;
    const score = Math.round(
      ((citedCount * 1.0 + mentionedCount * 0.4) / count) * 100
    );

    await prisma.geoScoreSnapshot.create({
      data: {
        workspaceId: ctx.workspaceId,
        score,
        breakdown: JSON.parse(JSON.stringify(breakdown)),
      },
    });

    // Action item: top missed prompt where a competitor was cited but we were not.
    const miss = breakdown.find((b) => !b.cited && b.competitors.length > 0);
    if (miss) {
      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "geo",
          type: "geo.gap",
          title: `LLMs cite ${miss.competitors[0]} for "${miss.prompt.slice(0, 60)}"`,
          summary: `We are not yet cited for this query. Publish authoritative content, get mentioned on high-authority sites, and ensure clean structured data.`,
          cta: "See analysis",
          href: "/agents/geo",
          priority: "HIGH",
        },
      });
    }

    return { score, breakdown };
  },
};

function inferBrandName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const root = host.split(".")[0];
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return "Your brand";
  }
}

async function buildProbes(ctx: AgentContext, brand: string): Promise<string[]> {
  const voice = ctx.voiceProfile as
    | { topicClusters?: Array<{ theme: string; keywords: string[] }> }
    | null;

  const base: string[] = [];
  if (voice?.topicClusters?.length) {
    for (const cluster of voice.topicClusters.slice(0, 3)) {
      base.push(`What are the best tools for ${cluster.theme}?`);
      if (cluster.keywords?.[0]) {
        base.push(`How do I ${cluster.keywords[0]}?`);
      }
    }
  }

  if (ctx.industry) {
    base.push(`What are the top ${ctx.industry} platforms in 2026?`);
  }
  if (ctx.icp && base.length < 4) {
    base.push(`Best tools for ${ctx.icp.split(".")[0]?.trim()}`);
  }

  base.push(`What is ${brand}?`);

  // De-dupe and cap
  return [...new Set(base)].slice(0, 6);
}

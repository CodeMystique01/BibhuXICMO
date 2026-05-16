import { z } from "zod";
import {
  siteScrapePipeline,
  emptyPageSnapshot,
  type PageSnapshot,
} from "@/backend/pipelines/site-scrape.pipeline";
import {
  CMO_PREFERRED_MODEL,
  meteredGenerateObject,
  pickAvailableModel,
} from "@/backend/llm";

export const strategySchema = z.object({
  industry: z.string().describe("Industry vertical in 2-5 words"),
  icp: z.string().describe("Ideal customer profile: who the product is for"),
  positioning: z.string().describe("One-sentence positioning statement"),
  voice: z.object({
    tone: z.string(),
    styleGuidelines: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  valueProps: z.array(z.string()).min(3).max(7),
  channels: z
    .array(z.enum(["reddit", "seo", "geo", "x", "linkedin", "hackernews", "content"]))
    .describe("Best marketing channels for this business"),
  competitors: z.array(z.string()).max(10),
  topicClusters: z
    .array(
      z.object({
        theme: z.string(),
        keywords: z.array(z.string()).min(3),
      })
    )
    .max(5),
  firstActions: z
    .array(
      z.object({
        title: z.string(),
        reason: z.string(),
        priority: z.enum(["low", "medium", "high"]),
      })
    )
    .max(8),
});

export type Strategy = z.infer<typeof strategySchema>;

const SYSTEM_PROMPT = `You are a senior marketing strategist. Given a single web page snapshot, infer the business model, target audience, positioning, and the highest-leverage marketing channels. Be concrete — reference specifics from the page text. If information is missing, make the best inference and mark it as such in the field.

Hard requirements:
- competitors: ALWAYS list 3-6 real, well-known direct competitors that target the same ICP. Never leave this empty. If the niche is unclear, use the closest analog category leaders.
- topicClusters: at least 1 cluster with 3+ keywords.
- valueProps: 3-5 concrete prop sentences (no fluff).`;

/**
 * Onboarding: fetch homepage → LLM structured strategy for workspace voice profile.
 *
 * The CMO experience is Claude-first — we try Anthropic before OpenAI when both
 * keys are present so onboarding voice / competitor inference matches whatever
 * the dashboard chat will use.
 */
export class StrategyPipeline {
  async generate(input: {
    workspaceId: string;
    websiteUrl: string;
  }): Promise<{ strategy: Strategy; snapshot: PageSnapshot }> {
    let snapshot: PageSnapshot;
    try {
      snapshot = await siteScrapePipeline.fetchPage(input.websiteUrl);
    } catch (err) {
      console.error("Homepage fetch failed (timeout, block, or network):", err);
      snapshot = emptyPageSnapshot(input.websiteUrl, 0);
    }

    const prompt = StrategyPipeline.buildPrompt(snapshot);
    const model = pickAvailableModel(CMO_PREFERRED_MODEL);

    if (!model) {
      return {
        strategy: StrategyPipeline.fallbackStrategy(snapshot),
        snapshot,
      };
    }

    try {
      // meteredGenerateObject already retries across configured providers
      // (Claude → OpenAI → Gemini → ...) when one returns auth/rate errors.
      const { object } = await meteredGenerateObject(prompt, strategySchema, {
        workspaceId: input.workspaceId,
        reason: "onboarding.strategy",
        model,
        system: SYSTEM_PROMPT,
      });

      return { strategy: object, snapshot };
    } catch (err) {
      console.error("Onboarding strategy LLM failed, using homepage fallback:", err);
      return {
        strategy: StrategyPipeline.fallbackStrategy(snapshot),
        snapshot,
      };
    }
  }

  private static buildPrompt(snap: PageSnapshot): string {
    return [
      `URL: ${snap.url}`,
      `Title: ${snap.title}`,
      `Description: ${snap.description}`,
      `H1: ${snap.h1.slice(0, 5).join(" | ")}`,
      `H2: ${snap.h2.slice(0, 10).join(" | ")}`,
      `Body excerpt:\n${snap.text.slice(0, 6000)}`,
      "",
      "Analyze the page and produce the strategy object.",
    ].join("\n");
  }

  private static fallbackStrategy(snap: PageSnapshot): Strategy {
    return {
      industry: "Unknown",
      icp: "Inferred from homepage — update after connecting GSC / GA4.",
      positioning: snap.description || snap.title || "Add positioning statement.",
      voice: {
        tone: "Neutral, professional",
        styleGuidelines: ["Be clear", "Lead with value", "Use active voice"],
        avoid: ["Jargon", "Unfounded claims"],
      },
      valueProps: [
        snap.h1[0] || "Value proposition 1",
        snap.h1[1] || "Value proposition 2",
        snap.h2[0] || "Value proposition 3",
      ].filter(Boolean) as string[],
      channels: ["seo", "content", "reddit", "geo"],
      // Intentionally empty — populating with placeholder text leaks instructions
      // into the Company panel as fake "competitors". An empty array makes the
      // UI render a clear "No competitors recorded yet" hint instead.
      competitors: [],
      topicClusters: [
        {
          theme: "Core product",
          keywords: snap.h2.slice(0, 5).length
            ? snap.h2.slice(0, 5)
            : ["product", "features", "pricing"],
        },
      ],
      firstActions: [
        {
          title: "Add a working LLM API key",
          reason:
            "Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY with billing credits, then re-run the SEO agent to populate competitors, positioning, and topic clusters.",
          priority: "high",
        },
        {
          title: "Connect Google Search Console",
          reason: "Unlock keyword and ranking data for the SEO agent.",
          priority: "high",
        },
        {
          title: "Add target subreddits",
          reason: "Let the Reddit agent start monitoring community threads.",
          priority: "medium",
        },
      ],
    };
  }
}

export const strategyPipeline = new StrategyPipeline();

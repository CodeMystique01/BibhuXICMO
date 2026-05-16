import { z } from "zod";
import { prisma } from "@/backend/db";
import { fetchPage, type PageSnapshot } from "@/backend/scraper/fetch";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { ruleBasedAudit } from "@/backend/seo-audit-rules";
import type { Agent, AgentContext } from "./base";

const auditSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        category: z.string(),
        title: z.string(),
        fix: z.string(),
        url: z.string().optional(),
      })
    )
    .max(20),
  opportunities: z.array(
    z.object({
      keyword: z.string(),
      intent: z.enum([
        "informational",
        "navigational",
        "commercial",
        "transactional",
      ]),
      why: z.string(),
    })
  ),
  contentIdeas: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      format: z.enum(["blog", "landing_page", "comparison", "guide"]),
    })
  ),
});

export type SEOAuditResult = z.infer<typeof auditSchema>;

const SYSTEM = `You are a senior technical SEO consultant. You review a page snapshot and return:
1) A numeric SEO score (0-100).
2) A list of concrete issues with severity and the exact fix.
3) Keyword opportunities the business should pursue.
4) Content ideas worth writing, each with an angle.
Be specific — cite the actual page elements you saw.`;

function buildPrompt(ctx: AgentContext, snap: PageSnapshot): string {
  return [
    `Workspace industry: ${ctx.industry || "unknown"}`,
    `Ideal customer: ${ctx.icp || "unknown"}`,
    "",
    `URL: ${snap.url}`,
    `Status: ${snap.status}`,
    `Title (${snap.title.length} chars): ${snap.title}`,
    `Description (${snap.description.length} chars): ${snap.description}`,
    `H1s: ${snap.h1.join(" | ") || "(none)"}`,
    `H2s: ${snap.h2.slice(0, 12).join(" | ") || "(none)"}`,
    `Word count: ${snap.wordCount}`,
    `Images without alt: ${snap.images.filter((i) => !i.alt).length}/${snap.images.length}`,
    `Internal links: ${snap.links.filter((l) => l.internal).length}`,
    `External links: ${snap.links.filter((l) => !l.internal).length}`,
    `Has JSON-LD: ${snap.jsonLd.length > 0}`,
    "",
    `Body excerpt:\n${snap.text.slice(0, 5000)}`,
  ].join("\n");
}

export const seoAgent: Agent<unknown, SEOAuditResult> = {
  id: "seo",
  title: "SEO Agent",
  schedule: "0 6 * * *", // daily 06:00 UTC
  minCredits: 1,
  async run(ctx: AgentContext): Promise<SEOAuditResult> {
    if (!ctx.websiteUrl) throw new Error("Workspace has no website URL");

    const snap = await fetchPage(ctx.websiteUrl);

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    let result: SEOAuditResult;

    if (model) {
      const { object } = await meteredGenerateObject(
        buildPrompt(ctx, snap),
        auditSchema,
        {
          workspaceId: ctx.workspaceId,
          reason: "seo.audit",
          model,
          system: SYSTEM,
        }
      );
      result = object;
    } else {
      result = fallbackAudit(snap);
    }

    await prisma.siteAudit.create({
      data: {
        workspaceId: ctx.workspaceId,
        score: result.score,
        issues: JSON.parse(JSON.stringify(result.issues)),
        pages: 1,
      },
    });

    // Persist top keyword opportunities
    for (const opp of result.opportunities.slice(0, 10)) {
      await prisma.keyword
        .upsert({
          where: {
            workspaceId_query_country: {
              workspaceId: ctx.workspaceId,
              query: opp.keyword.toLowerCase(),
              country: "us",
            },
          },
          create: {
            workspaceId: ctx.workspaceId,
            query: opp.keyword.toLowerCase(),
            intent: opp.intent,
          },
          update: { intent: opp.intent },
        })
        .catch(() => null);
    }

    // Emit action items
    const topIssues = result.issues
      .filter((i) => i.severity === "high")
      .slice(0, 3);
    for (const issue of topIssues) {
      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "seo",
          type: "seo.fix",
          title: issue.title,
          summary: issue.fix,
          cta: "Fix it",
          href: "/agents/seo",
          priority: "HIGH",
        },
      });
    }

    return result;
  },
};

function fallbackAudit(snap: PageSnapshot): SEOAuditResult {
  const rule = ruleBasedAudit(snap);
  return {
    score: rule.score,
    issues: rule.issues,
    opportunities: (snap.h2.length ? snap.h2 : snap.h1).slice(0, 3).map((h) => ({
      keyword: h.toLowerCase(),
      intent: "informational" as const,
      why: "Derived from page headings — validate with GSC.",
    })),
    contentIdeas: [
      {
        title: `The ultimate guide to ${snap.h1[0] || "your topic"}`,
        angle: "Pillar article targeting the main keyword cluster.",
        format: "guide",
      },
    ],
  };
}

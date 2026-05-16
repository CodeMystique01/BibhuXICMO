import { z } from "zod";
import { prisma } from "@/backend/db";
import { getIntegration } from "@/integrations/oauth";
import { openPullRequest } from "@/integrations/github";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { Agent, AgentContext } from "./base";
import { SITE_DOMAIN, SITE_NAME } from "@/shared/site";

const fileGenSchema = z.object({
  content: z.string().describe("Full file contents."),
  commitMessage: z.string(),
  prTitle: z.string(),
  prBody: z.string(),
});

type CodingInput = {
  repo: string; // owner/repo
  baseBranch?: string;
  fix: "robots" | "sitemap" | "schema" | "meta";
  filePath?: string;
  notes?: string;
};

const FIX_DESCRIPTIONS: Record<CodingInput["fix"], string> = {
  robots:
    "Create or update /public/robots.txt with sensible defaults (allow all, reference sitemap, disallow admin/preview paths).",
  sitemap:
    "Create /app/sitemap.ts (Next.js 15 App Router sitemap route) that exports a MetadataRoute.Sitemap.",
  schema:
    "Add JSON-LD Organization + WebSite structured data to the root layout of a Next.js 15 app.",
  meta:
    "Ensure the root layout's generateMetadata / metadata exports strong default title, description, and Open Graph tags.",
};

const FIX_DEFAULT_PATH: Record<CodingInput["fix"], string> = {
  robots: "public/robots.txt",
  sitemap: "app/sitemap.ts",
  schema: "app/structured-data.tsx",
  meta: "app/metadata.ts",
};

export const codingAgent: Agent<CodingInput, { prUrl?: string }> = {
  id: "coding",
  title: "Coding Agent",
  minCredits: 1,
  async run(ctx: AgentContext, input: CodingInput): Promise<{ prUrl?: string }> {
    const gh = await getIntegration(ctx.workspaceId, "GITHUB");
    if (!gh) throw new Error("Connect GitHub first under Integrations.");

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    const filePath = input.filePath ?? FIX_DEFAULT_PATH[input.fix];
    const prompt = [
      `Repository: ${input.repo}`,
      `Task: ${FIX_DESCRIPTIONS[input.fix]}`,
      `File to write: ${filePath}`,
      ctx.websiteUrl && `Site URL: ${ctx.websiteUrl}`,
      ctx.industry && `Industry: ${ctx.industry}`,
      input.notes && `Notes: ${input.notes}`,
      "",
      "Produce the full file content (no truncation), a concise commit message, PR title, and a 3-5 line PR body that explains the change.",
    ]
      .filter(Boolean)
      .join("\n");

    let generated: z.infer<typeof fileGenSchema>;
    if (model) {
      const { object } = await meteredGenerateObject(prompt, fileGenSchema, {
        workspaceId: ctx.workspaceId,
        reason: "coding.generate",
        model,
      });
      generated = object;
    } else {
      generated = {
        content: generateFallback(input.fix, ctx.websiteUrl),
        commitMessage: `chore: add ${filePath}`,
        prTitle: `Add ${filePath} (technical SEO)`,
        prBody: `Opened automatically by the ${SITE_NAME} Coding Agent.\n\n${FIX_DESCRIPTIONS[input.fix]}`,
      };
    }

    const branch = `xicmo/${input.fix}-${Date.now()}`;
    const result = await openPullRequest({
      workspaceId: ctx.workspaceId,
      fullName: input.repo,
      branch,
      baseBranch: input.baseBranch ?? "main",
      filePath,
      fileContents: generated.content,
      commitMessage: generated.commitMessage,
      title: generated.prTitle,
      body: generated.prBody,
    });

    if (result?.url) {
      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "coding",
          type: "coding.pr_opened",
          title: `PR opened: ${generated.prTitle}`,
          summary: generated.prBody,
          cta: "Review on GitHub",
          href: result.url,
          priority: "HIGH",
          meta: { repo: input.repo, fix: input.fix },
        },
      });
    }
    return { prUrl: result?.url };
  },
};

function generateFallback(
  fix: CodingInput["fix"],
  siteUrl: string | null
): string {
  const host = siteUrl ? new URL(siteUrl).origin : `https://${SITE_DOMAIN}`;

  if (fix === "robots") {
    return `# Allow all user agents\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /preview\n\nSitemap: ${host}/sitemap.xml\n`;
  }
  if (fix === "sitemap") {
    return `import type { MetadataRoute } from "next";\n\nexport default function sitemap(): MetadataRoute.Sitemap {\n  const base = "${host}";\n  return [\n    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },\n  ];\n}\n`;
  }
  if (fix === "schema") {
    return `export function StructuredData() {\n  const data = {\n    "@context": "https://schema.org",\n    "@type": "Organization",\n    name: "Your brand",\n    url: "${host}",\n  };\n  return (\n    <script\n      type="application/ld+json"\n      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}\n    />\n  );\n}\n`;
  }
  return `import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: { default: "Your brand", template: "%s · Your brand" },\n  description: "Add your one-line description here.",\n  openGraph: { type: "website", url: "${host}" },\n};\n`;
}

import { Linkedin } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";
import { hasLinkedInApifyToken } from "@/integrations/linkedin-apify";
import { LinkedInComposer } from "./composer";
import { LinkedInTools } from "./linkedin-tools";

export const metadata = { title: "LinkedIn Agent" };

/** Best-effort brand guess for the company-insights default input. */
function brandSlugFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
    const core = host.replace(/^www\./, "").split(".")[0];
    return core ? `https://www.linkedin.com/company/${core}` : "";
  } catch {
    return "";
  }
}

export default async function LinkedInAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs, integration] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: workspace.id, provider: "LINKEDIN" } },
    }),
  ]);

  return (
    <GenericAgentPage
      title="LinkedIn Agent"
      description="Scrape competitor posts and prospect profiles via Apify, then draft brand-voice content and personalized outreach. You publish."
      icon={Linkedin}
      agentId="linkedin"
      drafts={drafts}
      runs={runs}
      connected={!!integration}
      connectSlug="linkedin"
      extras={
        <div className="space-y-6">
          <LinkedInTools
            defaultCompany={brandSlugFromUrl(workspace.websiteUrl)}
            hasApifyToken={hasLinkedInApifyToken()}
          />
          <LinkedInComposer />
        </div>
      }
    />
  );
}

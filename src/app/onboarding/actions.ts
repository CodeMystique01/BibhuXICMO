"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/backend/auth";
import { prisma } from "@/backend/db";
import { normalizeUrl } from "@/backend/scraper/fetch";
import { generateStrategy } from "@/backend/agents/strategy";
import { Priority } from "@prisma/client";

const schema = z.object({
  websiteUrl: z.string().min(3, "Please enter a valid URL"),
});

export type OnboardResult =
  | { ok: true; workspaceId: string; note?: string }
  | { ok: false; error: string };

export async function startOnboardingAction(
  _prev: OnboardResult | null,
  formData: FormData
): Promise<OnboardResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };

  const parsed = schema.safeParse({ websiteUrl: formData.get("websiteUrl") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const websiteUrl = normalizeUrl(parsed.data.websiteUrl);

  // Validate URL format
  try {
    new URL(websiteUrl);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });

  if (!membership) return { ok: false, error: "No workspace found" };
  const workspace = membership.workspace;

  // Save the URL up front so we never lose it, even if the strategy LLM fails.
  // The user can land on /agent/cmo and re-run analysis without retyping it.
  await prisma.workspace
    .update({
      where: { id: workspace.id },
      data: { websiteUrl },
    })
    .catch((err) =>
      console.error("[onboarding] could not persist website URL early:", err)
    );

  try {
    const { strategy, snapshot } = await generateStrategy({
      workspaceId: workspace.id,
      websiteUrl,
    });

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        websiteUrl,
        industry: strategy.industry,
        icp: strategy.icp,
        voiceProfile: JSON.parse(JSON.stringify({
          ...strategy.voice,
          positioning: strategy.positioning,
          valueProps: strategy.valueProps,
          competitors: strategy.competitors,
          topicClusters: strategy.topicClusters,
          channels: strategy.channels,
          siteTitle: snapshot.title,
          siteDescription: snapshot.description,
        })),
      },
    });

    if (strategy.firstActions.length > 0) {
      await prisma.actionItem.createMany({
        data: strategy.firstActions.map((a) => ({
          workspaceId: workspace.id,
          agent: "onboarding",
          type: "onboarding.next_step",
          title: a.title,
          summary: a.reason,
          priority: (a.priority.toUpperCase() as Priority) ?? Priority.MEDIUM,
        })),
      });
    }

    await prisma.agentRun.create({
      data: {
        workspaceId: workspace.id,
        agent: "strategy",
        status: "SUCCESS",
        input: { websiteUrl },
        output: JSON.parse(JSON.stringify(strategy)),
        finishedAt: new Date(),
      },
    });

    // Did the strategy come from a real LLM run (industry != "Unknown") or the
    // built-in fallback? If fallback, surface a soft note so the user knows
    // analysis was partial.
    const usedFallback = strategy.industry === "Unknown";
    return {
      ok: true,
      workspaceId: workspace.id,
      note: usedFallback
        ? "Saved your site, but the LLM did not respond — opened your dashboard with a starter strategy. Configure ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY and re-run the SEO agent for a deep analysis."
        : undefined,
    };
  } catch (err) {
    console.error("[onboarding] strategy run failed:", err);

    // We still want the user to land in the app. URL was already saved above.
    try {
      await prisma.agentRun.create({
        data: {
          workspaceId: workspace.id,
          agent: "strategy",
          status: "FAILED",
          input: { websiteUrl },
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      ok: true,
      workspaceId: workspace.id,
      note:
        "Saved your site. We couldn't fully analyze it (the LLM provider returned an error) — open AI CMO and click the homepage card to retry, or check ANTHROPIC_API_KEY / OPENAI_API_KEY.",
    };
  }
}

/**
 * "I don't have a site yet" path: marks the workspace with a placeholder URL
 * so requireWorkspace stops bouncing back to /onboarding, and seeds a
 * starter checklist of action items.
 */
export async function skipOnboardingAction() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });
  if (!membership) redirect("/login");

  if (!membership.workspace.websiteUrl) {
    await prisma.workspace.update({
      where: { id: membership.workspace.id },
      data: {
        websiteUrl: "https://example.com",
      },
    });
    await prisma.actionItem.createMany({
      data: [
        {
          workspaceId: membership.workspace.id,
          agent: "onboarding",
          type: "onboarding.add_site",
          title: "Add your real website URL",
          summary:
            "Open Settings → Workspace and replace the placeholder URL to unlock the full agent loop.",
          priority: "HIGH",
          cta: "Open settings",
          href: "/settings",
        },
        {
          workspaceId: membership.workspace.id,
          agent: "onboarding",
          type: "onboarding.try_chat",
          title: "Try the private chat workbench",
          summary:
            "Multi-model chat with built-in URL audit, GEO probe, and content drafting tools.",
          priority: "MEDIUM",
          cta: "Open chat",
          href: "/chat",
        },
      ],
    });
  }

  redirect("/agent/cmo");
}

export async function skipStrategyAction() {
  redirect("/agent/cmo");
}

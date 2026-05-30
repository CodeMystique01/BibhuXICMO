"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  clearIGCookies,
  saveIGCookies,
} from "@/backend/ig-cookies";

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().min(1).max(120),
  budgetMin: z.number().int().min(0).default(0),
  budgetMax: z.number().int().min(0).default(0),
  brief: z.string().max(2000).optional(),
  autopilot: z.boolean().default(false),
});

export async function createIGCampaignAction(input: unknown) {
  const { workspace } = await requireWorkspace();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.budgetMax > 0 && parsed.data.budgetMax < parsed.data.budgetMin) {
    return { ok: false as const, error: "budgetMax must be >= budgetMin" };
  }
  try {
    const c = await prisma.iGCampaign.create({
      data: {
        workspaceId: workspace.id,
        name: parsed.data.name,
        brand: parsed.data.brand,
        budgetMin: parsed.data.budgetMin,
        budgetMax: parsed.data.budgetMax,
        brief: parsed.data.brief,
        autopilot: parsed.data.autopilot,
        status: "DRAFT",
      },
    });
    revalidatePath("/agents/instagram");
    return { ok: true as const, id: c.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "create_failed" };
  }
}

export async function updateIGCampaignStatusAction(
  campaignId: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED"
) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.updateMany({
    where: { id: campaignId, workspaceId: workspace.id },
    data: { status },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function toggleIGCampaignAutopilotAction(
  campaignId: string,
  autopilot: boolean
) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.updateMany({
    where: { id: campaignId, workspaceId: workspace.id },
    data: { autopilot },
  });
  // Cascade flag to all open negotiations under this campaign.
  await prisma.iGNegotiation.updateMany({
    where: { campaignId, workspaceId: workspace.id },
    data: { autopilot },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function deleteIGCampaignAction(campaignId: string) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.deleteMany({
    where: { id: campaignId, workspaceId: workspace.id },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function saveIGCookiesAction(cookies: string) {
  const { workspace } = await requireWorkspace();
  if (!cookies?.trim()) {
    return { ok: false as const, error: "Cookies cannot be empty" };
  }
  try {
    await saveIGCookies(workspace.id, cookies.trim());
    revalidatePath("/agents/instagram");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "save_failed",
    };
  }
}

export async function clearIGCookiesAction() {
  const { workspace } = await requireWorkspace();
  await clearIGCookies(workspace.id);
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import type { IntegrationProvider } from "@prisma/client";

export async function disconnectIntegration(provider: IntegrationProvider) {
  const { workspace } = await requireWorkspace();
  await prisma.integration.deleteMany({
    where: { workspaceId: workspace.id, provider },
  });
  revalidatePath("/integrations");
  return { ok: true as const };
}

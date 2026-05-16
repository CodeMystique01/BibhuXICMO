"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { normalizeUrl } from "@/backend/scraper/fetch";

const schema = z.object({
  name: z.string().min(1).max(100),
  websiteUrl: z.string().optional(),
  industry: z.string().max(80).optional(),
  icp: z.string().max(400).optional(),
});

export async function updateWorkspaceAction(
  _prev: unknown,
  formData: FormData
): Promise<
  | { ok: true; resetStrategy?: boolean }
  | { ok: false; error: string }
> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  const parsed = schema.safeParse({
    name: formData.get("name"),
    websiteUrl: formData.get("websiteUrl") || undefined,
    industry: formData.get("industry") || undefined,
    icp: formData.get("icp") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  const nextUrl = parsed.data.websiteUrl ? normalizeUrl(parsed.data.websiteUrl) : null;
  const prevUrl = workspace.websiteUrl;

  /** Normalize comparison so http vs https and trailing slashes do not falsely skip reset. */
  const urlChanged =
    (prevUrl ?? "").replace(/\/$/, "") !== (nextUrl ?? "").replace(/\/$/, "");

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      name: parsed.data.name,
      websiteUrl: nextUrl,
      industry: urlChanged ? null : parsed.data.industry?.trim() || null,
      icp: urlChanged ? null : parsed.data.icp?.trim() || null,
      ...(urlChanged
        ? {
            voiceProfile: Prisma.DbNull,
            cmoLlmSnapshot: Prisma.DbNull,
          }
        : {}),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/agent/cmo");
  return { ok: true as const, resetStrategy: urlChanged };
}

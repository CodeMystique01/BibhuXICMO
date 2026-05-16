import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export type WorkspaceWithSubscription = Prisma.WorkspaceGetPayload<{
  include: { subscription: true };
}>;

/**
 * Per-request cached lookup of the membership + workspace. Both `(app)/layout`
 * and the underlying page call `requireWorkspace()`; without `cache()` that
 * would mean two DB round-trips on every nav. React's `cache()` dedupes the
 * call within a single server request.
 */
const loadMembership = cache(async (userId: string) => {
  return prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      workspace: { include: { subscription: true } },
      user: true,
    },
  });
});

/**
 * Returns the current user's primary workspace, or redirects to /login.
 * If the user has no workspace yet, redirects to /onboarding.
 */
export async function requireWorkspace(
  opts: { skipOnboardingCheck?: boolean } = {}
): Promise<{
  user: { id: string; name: string | null; email: string; image: string | null };
  workspace: WorkspaceWithSubscription;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await loadMembership(session.user.id);

  if (!membership) redirect("/onboarding");

  const workspace = membership.workspace;

  if (!opts.skipOnboardingCheck && !workspace.websiteUrl) {
    redirect("/onboarding");
  }

  return {
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      image: membership.user.image,
    },
    workspace,
  };
}

export async function getCurrentWorkspace() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: { include: { subscription: true } } },
  });
  return membership?.workspace ?? null;
}

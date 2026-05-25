import { prisma } from "@/backend/db";

/** Persist a discovered IG post; tolerates missing IGThread table (pre-migration). */
export async function upsertIGThread(data: {
  workspaceId: string;
  externalId: string;
  authorHandle: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string;
  likes: number;
  comments: number;
  relevance: number;
}) {
  try {
    await prisma.iGThread.upsert({
      where: {
        workspaceId_externalId: {
          workspaceId: data.workspaceId,
          externalId: data.externalId,
        },
      },
      create: data,
      update: {
        likes: data.likes,
        comments: data.comments,
        relevance: data.relevance,
        caption: data.caption,
        mediaUrl: data.mediaUrl,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[ig] IGThread table missing — run prisma db push / migrate");
      return;
    }
    throw err;
  }
}

/** Persist a discovered creator; tolerates missing IGCreator table. */
export async function upsertIGCreator(data: {
  workspaceId: string;
  handle: string;
  fullName: string | null;
  bio: string | null;
  followers: number;
  following?: number | null;
  postsCount?: number | null;
  engagementRate: number | null;
  qualityScore?: number | null;
  email?: string | null;
  category?: string | null;
  niche?: string | null;
  isVerified?: boolean;
  isBusiness?: boolean;
  externalUrl?: string | null;
  profileUrl: string;
  profilePicture?: string | null;
  fit: number;
  notes?: string | null;
}) {
  const createPayload = {
    workspaceId: data.workspaceId,
    handle: data.handle,
    fullName: data.fullName,
    bio: data.bio,
    followers: data.followers,
    following: data.following ?? null,
    postsCount: data.postsCount ?? null,
    engagementRate: data.engagementRate,
    qualityScore: data.qualityScore ?? null,
    email: data.email ?? null,
    category: data.category ?? null,
    niche: data.niche ?? null,
    isVerified: data.isVerified ?? false,
    isBusiness: data.isBusiness ?? false,
    externalUrl: data.externalUrl ?? null,
    profileUrl: data.profileUrl,
    profilePicture: data.profilePicture ?? null,
    fit: data.fit,
    notes: data.notes ?? null,
  };
  const updatePayload = {
    fullName: data.fullName ?? undefined,
    bio: data.bio ?? undefined,
    followers: data.followers,
    following: data.following ?? undefined,
    postsCount: data.postsCount ?? undefined,
    engagementRate: data.engagementRate ?? undefined,
    qualityScore: data.qualityScore ?? undefined,
    email: data.email ?? undefined,
    category: data.category ?? undefined,
    niche: data.niche ?? undefined,
    isVerified: data.isVerified ?? undefined,
    isBusiness: data.isBusiness ?? undefined,
    externalUrl: data.externalUrl ?? undefined,
    profileUrl: data.profileUrl,
    profilePicture: data.profilePicture ?? undefined,
    fit: data.fit,
    notes: data.notes ?? undefined,
  };

  try {
    return await prisma.iGCreator.upsert({
      where: {
        workspaceId_handle: {
          workspaceId: data.workspaceId,
          handle: data.handle,
        },
      },
      create: createPayload,
      update: updatePayload,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") {
      console.warn("[ig] IGCreator table missing — run prisma db push / migrate");
      return null;
    }
    throw err;
  }
}

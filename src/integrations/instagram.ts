/**
 * Instagram Graph API integration.
 *
 * Authentication: Facebook OAuth (handled by the generic
 * `/api/integrations/instagram/start` + `callback` routes). The connected
 * user must own (or have admin rights to) a Facebook Page that has an
 * Instagram Business or Creator account linked. We lazily resolve the
 * `igAccountId` + page access token on first use and cache them in
 * `Integration.meta`.
 *
 * Capabilities (Graph API v18+, free):
 *  - Fetch own recent media + comments
 *  - Reply to comments on own posts
 *  - Publish image posts / reels / stories (two-step container -> publish)
 *
 * Not in scope here:
 *  - DMs to non-followers (no API for cold DMs; see `instagram-apify-dm.ts`)
 *  - Influencer / hashtag discovery (see `instagram-apify.ts`)
 */
import { prisma } from "@/backend/db";
import { getIntegration } from "./oauth";

const GRAPH_BASE = "https://graph.facebook.com/v18.0";

export type IGAccountResolution = {
  igAccountId: string;
  pageId: string;
  pageToken: string;
  pageName?: string;
  username?: string;
};

export class InstagramNotConnectedError extends Error {
  constructor(msg = "Instagram is not connected for this workspace") {
    super(msg);
    this.name = "InstagramNotConnectedError";
  }
}

/**
 * Resolve the IG Business account linked to one of the connected user's Pages.
 * Caches the result on the Integration row so future calls are free.
 */
export async function resolveIgBusinessAccount(
  workspaceId: string
): Promise<IGAccountResolution | null> {
  const integration = await getIntegration(workspaceId, "INSTAGRAM");
  if (!integration) return null;

  const meta = (integration.meta ?? {}) as Record<string, unknown>;
  if (
    typeof meta.igAccountId === "string" &&
    typeof meta.pageId === "string" &&
    typeof meta.pageToken === "string"
  ) {
    return {
      igAccountId: meta.igAccountId,
      pageId: meta.pageId,
      pageToken: meta.pageToken,
      pageName: typeof meta.pageName === "string" ? meta.pageName : undefined,
      username: typeof meta.username === "string" ? meta.username : undefined,
    };
  }

  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(integration.accessToken)}&fields=id,name,access_token`
  );
  if (!pagesRes.ok) return null;
  const pages = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
  };

  for (const page of pages.data ?? []) {
    const igRes = await fetch(
      `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`
    );
    if (!igRes.ok) continue;
    const ig = (await igRes.json()) as {
      instagram_business_account?: { id: string };
    };
    if (!ig.instagram_business_account?.id) continue;

    // Also fetch the IG username so the UI can show "@handle".
    let username: string | undefined;
    try {
      const u = await fetch(
        `${GRAPH_BASE}/${ig.instagram_business_account.id}?fields=username&access_token=${encodeURIComponent(page.access_token)}`
      );
      if (u.ok) {
        const j = (await u.json()) as { username?: string };
        username = j.username;
      }
    } catch {
      /* ignore — username is optional */
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        accountLabel: username ?? page.name,
        accountId: ig.instagram_business_account.id,
        meta: {
          ...meta,
          igAccountId: ig.instagram_business_account.id,
          pageId: page.id,
          pageToken: page.access_token,
          pageName: page.name,
          username,
        },
      },
    });

    return {
      igAccountId: ig.instagram_business_account.id,
      pageId: page.id,
      pageToken: page.access_token,
      pageName: page.name,
      username,
    };
  }

  return null;
}

export type IGOwnMedia = {
  id: string;
  caption?: string;
  permalink: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | string;
  timestamp: string;
  commentsCount: number;
};

export async function fetchRecentOwnMedia(
  workspaceId: string,
  limit = 10
): Promise<IGOwnMedia[]> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) return [];

  const url =
    `${GRAPH_BASE}/${acc.igAccountId}/media` +
    `?fields=id,caption,permalink,media_type,timestamp,comments_count` +
    `&limit=${limit}&access_token=${encodeURIComponent(acc.pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      caption?: string;
      permalink: string;
      media_type: string;
      timestamp: string;
      comments_count?: number;
    }>;
  };
  return (json.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption,
    permalink: m.permalink,
    mediaType: m.media_type,
    timestamp: m.timestamp,
    commentsCount: m.comments_count ?? 0,
  }));
}

export type IGComment = {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likeCount: number;
  parentId?: string;
};

export async function fetchOwnComments(
  workspaceId: string,
  mediaId: string,
  limit = 25
): Promise<IGComment[]> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) return [];

  const url =
    `${GRAPH_BASE}/${mediaId}/comments` +
    `?fields=id,text,username,timestamp,like_count` +
    `&limit=${limit}&access_token=${encodeURIComponent(acc.pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      text: string;
      username: string;
      timestamp: string;
      like_count?: number;
    }>;
  };
  return (json.data ?? []).map((c) => ({
    id: c.id,
    text: c.text,
    username: c.username,
    timestamp: c.timestamp,
    likeCount: c.like_count ?? 0,
  }));
}

export async function replyToComment(
  workspaceId: string,
  commentId: string,
  message: string
): Promise<{ id: string } | null> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) throw new InstagramNotConnectedError();

  const res = await fetch(`${GRAPH_BASE}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      message,
      access_token: acc.pageToken,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`IG comment reply failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { id: string };
}

/**
 * Two-step image publish: create container -> publish.
 * `imageUrl` must be publicly reachable (Graph API fetches it server-side).
 */
export async function publishImagePost(
  workspaceId: string,
  imageUrl: string,
  caption: string
): Promise<{ id: string; permalink?: string } | null> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) throw new InstagramNotConnectedError();

  const containerRes = await fetch(
    `${GRAPH_BASE}/${acc.igAccountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: acc.pageToken,
      }),
    }
  );
  if (!containerRes.ok) {
    throw new Error(`IG container create failed: ${await containerRes.text()}`);
  }
  const container = (await containerRes.json()) as { id: string };

  const publishRes = await fetch(
    `${GRAPH_BASE}/${acc.igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: acc.pageToken,
      }),
    }
  );
  if (!publishRes.ok) {
    throw new Error(`IG publish failed: ${await publishRes.text()}`);
  }
  const published = (await publishRes.json()) as { id: string };

  // Best-effort permalink fetch.
  let permalink: string | undefined;
  try {
    const meta = await fetch(
      `${GRAPH_BASE}/${published.id}?fields=permalink&access_token=${encodeURIComponent(acc.pageToken)}`
    );
    if (meta.ok) {
      const j = (await meta.json()) as { permalink?: string };
      permalink = j.permalink;
    }
  } catch {
    /* ignore */
  }

  return { id: published.id, permalink };
}

export async function publishReel(
  workspaceId: string,
  videoUrl: string,
  caption: string
): Promise<{ id: string; permalink?: string } | null> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) throw new InstagramNotConnectedError();

  const containerRes = await fetch(`${GRAPH_BASE}/${acc.igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: acc.pageToken,
    }),
  });
  if (!containerRes.ok) {
    throw new Error(`IG reel container failed: ${await containerRes.text()}`);
  }
  const container = (await containerRes.json()) as { id: string };

  // Reels need a moment of processing before publish.
  await new Promise((r) => setTimeout(r, 2500));

  const publishRes = await fetch(
    `${GRAPH_BASE}/${acc.igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: acc.pageToken,
      }),
    }
  );
  if (!publishRes.ok) {
    throw new Error(`IG reel publish failed: ${await publishRes.text()}`);
  }
  const published = (await publishRes.json()) as { id: string };
  return { id: published.id };
}

export async function publishStory(
  workspaceId: string,
  mediaUrl: string,
  isVideo = false
): Promise<{ id: string } | null> {
  const acc = await resolveIgBusinessAccount(workspaceId);
  if (!acc) throw new InstagramNotConnectedError();

  const containerRes = await fetch(`${GRAPH_BASE}/${acc.igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "STORIES",
      ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }),
      access_token: acc.pageToken,
    }),
  });
  if (!containerRes.ok) {
    throw new Error(`IG story container failed: ${await containerRes.text()}`);
  }
  const container = (await containerRes.json()) as { id: string };

  const publishRes = await fetch(
    `${GRAPH_BASE}/${acc.igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: acc.pageToken,
      }),
    }
  );
  if (!publishRes.ok) {
    throw new Error(`IG story publish failed: ${await publishRes.text()}`);
  }
  return (await publishRes.json()) as { id: string };
}

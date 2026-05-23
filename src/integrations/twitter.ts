import { getIntegration } from "./oauth";
import { env } from "@/shared/env";
import { prisma } from "@/backend/db";

export async function refreshTwitterToken(workspaceId: string): Promise<string | null> {
  const integration = await getIntegration(workspaceId, "TWITTER");
  if (!integration) return null;
  if (integration.expiresAt && integration.expiresAt > new Date(Date.now() + 60_000)) {
    return integration.accessToken;
  }
  if (!integration.refreshToken || !env.X_CLIENT_ID || !env.X_CLIENT_SECRET) {
    return integration.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
  });
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return integration.accessToken;
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? integration.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
    },
  });
  return json.access_token;
}

export type PostTweetOptions = {
  /** Reply to a specific tweet id (sets reply.in_reply_to_tweet_id). */
  replyTo?: string;
};

export async function postTweet(
  workspaceId: string,
  text: string,
  opts: PostTweetOptions = {}
): Promise<{ id: string; url: string } | null> {
  const token = await refreshTwitterToken(workspaceId);
  if (!token) return null;

  const payload: Record<string, unknown> = { text };
  if (opts.replyTo) payload.reply = { in_reply_to_tweet_id: opts.replyTo };

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`Tweet failed: ${res.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return {
    id: json.data.id,
    url: `https://twitter.com/i/web/status/${json.data.id}`,
  };
}

/** Fetch the authenticated user's @handle (for the integrations card). */
export async function fetchAuthedHandle(
  workspaceId: string
): Promise<{ id: string; username: string } | null> {
  const token = await refreshTwitterToken(workspaceId);
  if (!token) return null;
  const res = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { id: string; username: string; name?: string };
  };
  if (!json.data) return null;
  return { id: json.data.id, username: json.data.username };
}

export async function postThread(
  workspaceId: string,
  tweets: string[]
): Promise<{ firstId: string; urls: string[] } | null> {
  const token = await refreshTwitterToken(workspaceId);
  if (!token) return null;
  if (tweets.length === 0) return null;

  let previousId: string | undefined;
  const urls: string[] = [];

  for (const text of tweets) {
    const payload: Record<string, unknown> = { text };
    if (previousId) payload.reply = { in_reply_to_tweet_id: previousId };

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Thread tweet failed at ${urls.length}: ${res.status}`);
    }
    const json = (await res.json()) as { data: { id: string } };
    previousId = json.data.id;
    urls.push(`https://twitter.com/i/web/status/${json.data.id}`);
  }

  return { firstId: urls[0].split("/").pop()!, urls };
}

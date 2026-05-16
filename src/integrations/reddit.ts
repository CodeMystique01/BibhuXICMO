import { env } from "@/shared/env";
import { getIntegration } from "./oauth";
import { prisma } from "@/backend/db";

const USER_AGENT = env.REDDIT_USER_AGENT;

/**
 * Reddit supports unauthenticated search via the public JSON API with
 * rate-limits — fine for thread discovery. Posting requires OAuth.
 */

export type RedditSearchResult = {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  author: string;
  url: string;
};

export async function searchReddit(
  query: string,
  opts: { subreddit?: string; limit?: number; sort?: "relevance" | "new" | "top" } = {}
): Promise<RedditSearchResult[]> {
  const base = opts.subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(opts.subreddit)}/search.json`
    : "https://www.reddit.com/search.json";

  const url = new URL(base);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(opts.limit ?? 25));
  url.searchParams.set("sort", opts.sort ?? "relevance");
  if (opts.subreddit) url.searchParams.set("restrict_sr", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Reddit search failed: ${res.status}`);
  }
  const json = await res.json();
  const children = (json as { data?: { children?: { data: unknown }[] } }).data?.children ?? [];
  return children.map((c) => c.data as RedditSearchResult);
}

export async function refreshRedditToken(workspaceId: string): Promise<string | null> {
  const integration = await getIntegration(workspaceId, "REDDIT");
  if (!integration) return null;
  if (integration.expiresAt && integration.expiresAt > new Date(Date.now() + 60_000)) {
    return integration.accessToken;
  }
  if (!integration.refreshToken) return integration.accessToken;
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return integration.accessToken;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
  });
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  if (!res.ok) return integration.accessToken;
  const json = (await res.json()) as { access_token: string; expires_in?: number };

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: json.access_token,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : null,
    },
  });
  return json.access_token;
}

export async function submitRedditReply(
  workspaceId: string,
  parentFullname: string,
  text: string
): Promise<{ id: string; url: string } | null> {
  const token = await refreshRedditToken(workspaceId);
  if (!token) return null;

  const body = new URLSearchParams({
    api_type: "json",
    thing_id: parentFullname,
    text,
  });
  const res = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Reddit reply failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    json: { data?: { things: { data: { id: string; permalink: string } }[] } };
  };
  const thing = json.json?.data?.things?.[0]?.data;
  if (!thing) return null;
  return {
    id: thing.id,
    url: `https://www.reddit.com${thing.permalink}`,
  };
}

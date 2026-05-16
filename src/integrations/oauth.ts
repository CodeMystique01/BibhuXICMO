import { randomBytes } from "crypto";
import { prisma } from "@/backend/db";
import type { IntegrationProvider } from "@prisma/client";

export type OAuthProviderConfig = {
  provider: IntegrationProvider;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Extra fields appended to authorize URL (e.g. duration=permanent for Reddit) */
  extraAuthParams?: Record<string, string>;
  /** basic = use HTTP Basic auth for token exchange (Reddit, X v2), body = post as form body */
  tokenAuth: "basic" | "body";
};

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const states = new Map<string, { workspaceId: string; provider: IntegrationProvider; expires: number }>();

export function makeState(workspaceId: string, provider: IntegrationProvider): string {
  const state = randomBytes(16).toString("hex");
  states.set(state, { workspaceId, provider, expires: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeState(state: string) {
  const entry = states.get(state);
  if (!entry) return null;
  states.delete(state);
  if (entry.expires < Date.now()) return null;
  return entry;
}

export function buildAuthorizeUrl(
  cfg: OAuthProviderConfig,
  redirectUri: string,
  state: string
): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  if (cfg.clientId) u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

export async function exchangeCode(
  cfg: OAuthProviderConfig,
  redirectUri: string,
  code: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (cfg.tokenAuth === "basic" && cfg.clientId && cfg.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  } else {
    if (cfg.clientId) body.set("client_id", cfg.clientId);
    if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function saveIntegration({
  workspaceId,
  provider,
  tokens,
  accountLabel,
  accountId,
  meta,
}: {
  workspaceId: string;
  provider: IntegrationProvider;
  tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  accountLabel?: string;
  accountId?: string;
  meta?: Record<string, unknown>;
}) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: {
      workspaceId,
      provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      expiresAt,
      accountLabel,
      accountId,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      scope: tokens.scope,
      expiresAt,
      accountLabel,
      accountId,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
    },
  });
}

export async function getIntegration(
  workspaceId: string,
  provider: IntegrationProvider
) {
  return prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });
}

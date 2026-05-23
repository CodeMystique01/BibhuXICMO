import { NextResponse, type NextRequest } from "next/server";
import {
  consumeState,
  exchangeCode,
  saveIntegration,
} from "@/integrations/oauth";
import {
  getProviderConfig,
  redirectUriFor,
} from "@/integrations/providers";
import type { IntegrationProvider } from "@prisma/client";
import { env } from "@/shared/env";

const SLUG_MAP: Record<string, IntegrationProvider> = {
  reddit: "REDDIT",
  twitter: "TWITTER",
  x: "TWITTER",
  linkedin: "LINKEDIN",
  "google-search-console": "GOOGLE_SEARCH_CONSOLE",
  gsc: "GOOGLE_SEARCH_CONSOLE",
  "google-analytics": "GOOGLE_ANALYTICS",
  ga4: "GOOGLE_ANALYTICS",
  github: "GITHUB",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider: slug } = await ctx.params;
  const provider = SLUG_MAP[slug];
  if (!provider) return errorRedirect("unknown_provider");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return errorRedirect(error);
  if (!code || !state) return errorRedirect("missing_params");

  const stateEntry = consumeState(state);
  if (!stateEntry || stateEntry.provider !== provider) {
    return errorRedirect("invalid_state");
  }

  const cfg = getProviderConfig(provider);
  if (!cfg) return errorRedirect("not_configured");

  try {
    const tokens = await exchangeCode(cfg, redirectUriFor(provider), code);
    await saveIntegration({
      workspaceId: stateEntry.workspaceId,
      provider,
      tokens,
    });
    return NextResponse.redirect(`${env.APP_URL}/integrations?connected=${slug}`);
  } catch (e) {
    console.error(`OAuth exchange failed for ${provider}:`, e);
    return errorRedirect("exchange_failed");
  }
}

function errorRedirect(code: string) {
  return NextResponse.redirect(`${env.APP_URL}/integrations?error=${encodeURIComponent(code)}`);
}

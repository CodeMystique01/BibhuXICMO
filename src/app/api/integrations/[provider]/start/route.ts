import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/backend/workspace";
import {
  buildAuthorizeUrl,
  makeState,
} from "@/integrations/oauth";
import {
  getProviderConfig,
  redirectUriFor,
} from "@/integrations/providers";
import type { IntegrationProvider } from "@prisma/client";

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
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider: slug } = await ctx.params;
  const provider = SLUG_MAP[slug];
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  const cfg = getProviderConfig(provider);
  if (!cfg) {
    return NextResponse.json(
      { error: `${provider} is not configured. Set the required client_id/client_secret env vars.` },
      { status: 503 }
    );
  }

  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  const redirectUri = redirectUriFor(provider);
  const state = makeState(workspace.id, provider);
  const url = buildAuthorizeUrl(cfg, redirectUri, state);

  return NextResponse.redirect(url);
}

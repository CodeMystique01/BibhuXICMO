import type { IntegrationProvider } from "@prisma/client";
import { env } from "@/shared/env";
import type { OAuthProviderConfig } from "./oauth";

export function getProviderConfig(
  provider: IntegrationProvider
): OAuthProviderConfig | null {
  switch (provider) {
    case "REDDIT":
      if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.REDDIT_CLIENT_ID,
        clientSecret: env.REDDIT_CLIENT_SECRET,
        authorizeUrl: "https://www.reddit.com/api/v1/authorize",
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        scope: "identity read submit vote history",
        extraAuthParams: { duration: "permanent" },
        tokenAuth: "basic",
      };
    case "TWITTER":
      if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.X_CLIENT_ID,
        clientSecret: env.X_CLIENT_SECRET,
        authorizeUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        scope: "tweet.read tweet.write users.read offline.access",
        tokenAuth: "basic",
      };
    case "LINKEDIN":
      if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scope: "openid profile email w_member_social",
        tokenAuth: "body",
      };
    case "GOOGLE_SEARCH_CONSOLE":
      if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.GSC_CLIENT_ID,
        clientSecret: env.GSC_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        extraAuthParams: { access_type: "offline", prompt: "consent" },
        tokenAuth: "body",
      };
    case "GOOGLE_ANALYTICS":
      if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.GSC_CLIENT_ID,
        clientSecret: env.GSC_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/analytics.readonly",
        extraAuthParams: { access_type: "offline", prompt: "consent" },
        tokenAuth: "body",
      };
    case "GITHUB":
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
      return {
        provider,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scope: "repo read:user",
        tokenAuth: "body",
      };
  }
}

export function redirectUriFor(provider: IntegrationProvider) {
  const slug = provider.toLowerCase().replace(/_/g, "-");
  return `${env.APP_URL}/api/integrations/${slug}/callback`;
}

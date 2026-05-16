import { env } from "@/shared/env";

/** True when Google OAuth env vars are set (server-side). */
export function oauthGoogleEnabled(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

/** True when GitHub OAuth env vars are set (server-side). */
export function oauthGithubEnabled(): boolean {
  return Boolean(
    env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim(),
  );
}

/**
 * Client-side URL normalization. Mirrors `normalizeUrl()` on the server but
 * stays browser-only so it can be imported by client components without
 * pulling Node deps.
 *
 * - Adds `https://` if no protocol.
 * - Trims whitespace + trailing slash.
 * - Strips hash fragments.
 * - Returns `null` if the input does not parse as a URL.
 */
export function clientNormalizeUrl(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  let v = trimmed;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    u.hash = "";
    // Bail on hostnames without a dot (`localhost`, `intranet`) — those are
    // almost always typos in this app's marketing-facing audit/onboarding
    // contexts.
    if (!u.hostname.includes(".")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

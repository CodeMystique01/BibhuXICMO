/**
 * Single source of truth for public site identity (xicmo.com).
 * Import from UI, emails, scraper UA, and legal copy — avoid hard-coded strings.
 */
export const SITE_NAME = "Xicmo";
export const SITE_DOMAIN = "xicmo.com";

/** Short product descriptor (nav, meta). */
export const PRODUCT_LINE = "AI growth platform";

/** Hero / landing primary supporting line. */
export const SITE_TAGLINE =
  "The AI growth stack for founders — every channel, one workspace. SEO, GEO, Reddit, X, LinkedIn, Hacker News, and more.";

export const CONTACT = {
  support: `support@${SITE_DOMAIN}`,
  sales: `sales@${SITE_DOMAIN}`,
  hello: `hello@${SITE_DOMAIN}`,
  privacy: `privacy@${SITE_DOMAIN}`,
  billing: `billing@${SITE_DOMAIN}`,
  jobs: `jobs@${SITE_DOMAIN}`,
} as const;

export function mailto(email: string, subject?: string) {
  if (!subject) return `mailto:${email}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** Crawler / integration user-agent fragment (full string built where fetch happens). */
export const CRAWLER_PRODUCT_TOKEN = "xicmo-bot/0.1";

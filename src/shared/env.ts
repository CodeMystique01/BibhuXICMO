import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Supabase: use the transaction pooler URL (port 6543, ?pgbouncer=true) here.
  DATABASE_URL: z
    .string()
    .default("postgresql://xicmo:xicmo@localhost:5432/xicmo?schema=public"),
  // Supabase: direct/session connection (port 5432) for `prisma db push`.
  // Falls back to DATABASE_URL locally where a single Postgres serves both.
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  AUTH_SECRET: z.string().min(1).default("dev-secret-change-me"),
  AUTH_URL: z.string().url().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PRICE_MAX_MONTHLY: z.string().optional(),

  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().default("xicmo/0.1"),

  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  /** Facebook OAuth — needed for Instagram Business / Creator account connect. */
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  GSC_CLIENT_ID: z.string().optional(),
  GSC_CLIENT_SECRET: z.string().optional(),
  PAGESPEED_API_KEY: z.string().optional(),

  GOOGLE_GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  /** Shared secret expected by /api/cron/* routes. Vercel Cron sends this automatically. */
  CRON_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Xicmo <hello@xicmo.com>"),

  /** Apify token used for the Ahrefs scraper actor + any other Apify integrations. */
  APIFY_TOKEN: z.string().optional(),
  /**
   * Optional dedicated Apify token for the X (Twitter) scraper. If set, the
   * X agent uses this token instead of APIFY_TOKEN — useful when you want
   * Ahrefs and X to bill against separate Apify accounts / credit pools.
   * Falls back to APIFY_TOKEN when unset.
   */
  APIFY_X_TOKEN: z.string().optional(),
  /**
   * Optional dedicated Apify token for the SEO + GEO keyword tools
   * (Keyword Difficulty, Metrics, Rank, SERP Overview, Top Websites, AI
   * Visibility, AI Overview, Top AI-cited). If set, those tools bill
   * against this account instead of APIFY_TOKEN. Falls back to APIFY_TOKEN
   * when unset.
   */
  APIFY_SEO_TOKEN: z.string().optional(),
  /**
   * Apify actor id that returns Ahrefs-style site data (domain rating,
   * backlinks, organic traffic, top keywords). Defaults to the
   * `radeance/ahrefs-scraper` actor; override to swap providers.
   */
  APIFY_AHREFS_ACTOR_ID: z.string().default("radeance~ahrefs-scraper"),
  /**
   * Apify actor id for Google SERP scraping (used by the GEO AI Overviews
   * probe). The default `apify/google-search-scraper` is the most widely
   * deployed one — override only if you use a private/custom variant.
   */
  APIFY_GOOGLE_SERP_ACTOR_ID: z.string().default("apify~google-search-scraper"),
  /**
   * Apify actor id for Twitter / X tweet search. Returns recent tweets
   * matching a keyword query. Default actor: `apidojo/tweet-scraper`
   * (~$0.40 per 1k tweets, no X API Basic required).
   */
  APIFY_X_ACTOR_ID: z.string().default("apidojo~tweet-scraper"),

  /**
   * Optional dedicated Apify token for the Instagram scraper. If set,
   * the Instagram agent uses this token instead of APIFY_TOKEN — useful
   * when you want IG and X/Ahrefs scraping to bill against separate
   * Apify accounts. Falls back to APIFY_TOKEN when unset.
   */
  APIFY_IG_TOKEN: z.string().optional(),
  /** Apify actor id for general Instagram profile/post scraping. */
  APIFY_IG_ACTOR_ID: z.string().default("apify~instagram-scraper"),
  /** Apify actor id for hashtag-keyed Instagram post discovery. */
  APIFY_IG_HASHTAG_ACTOR_ID: z.string().default("apify~instagram-hashtag-scraper"),
  /** Apify actor id for Instagram DM automation (uses session cookies). */
  APIFY_IG_DM_ACTOR_ID: z.string().default("quickads~instagram-dm-automation"),
  /**
   * Apify actor id for the QuickAds-style network-expansion influencer
   * discovery. This actor takes 1–5 seed handles and returns up to 500
   * similar profiles with email, engagement rate, and a Quality label —
   * the InfluencerFind tab on /agents/instagram uses this exclusively.
   * Default: `afanasenko~instagram-profile-scraper` (Mode 3 networkExpansion).
   * Billed at $0.01 per analyzed profile on Apify.
   */
  APIFY_IG_NETWORK_ACTOR_ID: z
    .string()
    .default("afanasenko~instagram-profile-scraper"),

  /**
   * Optional shared Apify token for the LinkedIn agent. Used as a fallback
   * for both LinkedIn actors when a per-actor token below isn't set.
   * Falls back further to APIFY_TOKEN.
   */
  APIFY_LINKEDIN_TOKEN: z.string().optional(),
  /**
   * Apify token for the LinkedIn PROFILE scraper actor. Set this with the
   * Apify API key you want to bill profile lookups against.
   * Resolution order: APIFY_LINKEDIN_PROFILE_TOKEN → APIFY_LINKEDIN_TOKEN → APIFY_TOKEN.
   */
  APIFY_LINKEDIN_PROFILE_TOKEN: z.string().optional(),
  /**
   * Apify token for the LinkedIn COMPANY POSTS scraper actor. Set this with
   * the Apify API key you want to bill post scrapes against.
   * Resolution order: APIFY_LINKEDIN_POSTS_TOKEN → APIFY_LINKEDIN_TOKEN → APIFY_TOKEN.
   */
  APIFY_LINKEDIN_POSTS_TOKEN: z.string().optional(),
  /**
   * Apify actor id for the LinkedIn profile scraper. Returns a full profile
   * (experience, education, skills, headline, about) for one profile URL /
   * publicIdentifier per run. Default: `harvestapi/linkedin-profile-scraper`
   * (~$4 per 1k profiles, no cookies required).
   */
  APIFY_LINKEDIN_PROFILE_ACTOR_ID: z
    .string()
    .default("harvestapi~linkedin-profile-scraper"),
  /**
   * Apify actor id for the LinkedIn company/profile posts scraper. Returns
   * recent posts with engagement (likes/comments/shares) for one or more
   * company/profile URLs in a single run. Default:
   * `harvestapi/linkedin-company-posts` (~$2 per 1k posts; reactions and
   * comments bill as separate items, so we leave them off by default).
   */
  APIFY_LINKEDIN_COMPANY_POSTS_ACTOR_ID: z
    .string()
    .default("harvestapi~linkedin-company-posts"),

  /**
   * Google YouTube Data API v3 key. Powers /agents/youtube creator
   * search — same source the QuickAds reference uses. Get one at
   * https://console.cloud.google.com/apis/credentials after enabling
   * the "YouTube Data API v3" service. Free tier is 10 000 units/day
   * (≈99 keyword searches with full channel-detail enrichment).
   */
  YOUTUBE_API_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),

  /** Dev-only override: set to "1" to unlock every plan-gated feature and
   *  bypass credit checks. Use during development; never set in production. */
  XICMO_UNLOCK_ALL: z.string().optional(),

  /** Client-side mirror of XICMO_UNLOCK_ALL. Required for paywall overlays
   *  that live in client components and can't read server env vars. */
  NEXT_PUBLIC_XICMO_UNLOCK_ALL: z.string().optional(),

  /** Public URL of the Python Reddit Sales Agent FastAPI service
   *  (e.g. https://reddit-agent.onrender.com). Read client-side by the
   *  Reddit page to issue analyze / threads / posts requests. */
  NEXT_PUBLIC_REDDIT_AGENT_URL: z.string().url().optional(),
});

/** Vercel sets VERCEL_URL (no scheme); derive public URLs when app env is unset. */
function withVercelDefaults(input: NodeJS.ProcessEnv) {
  const fromVercel =
    input.VERCEL_URL != null && input.VERCEL_URL.length > 0
      ? `https://${input.VERCEL_URL}`
      : undefined;
  return {
    ...input,
    NEXT_PUBLIC_APP_URL: input.NEXT_PUBLIC_APP_URL ?? fromVercel,
    APP_URL: input.APP_URL ?? input.NEXT_PUBLIC_APP_URL ?? fromVercel,
    AUTH_URL: input.AUTH_URL ?? input.NEXT_PUBLIC_APP_URL ?? fromVercel,
  };
}

const parsed = envSchema.safeParse(withVercelDefaults(process.env));

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables. See .env.example.");
}

export const env = parsed.data;

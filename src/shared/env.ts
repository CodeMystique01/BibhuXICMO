import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z
    .string()
    .default("postgresql://xicmo:xicmo@localhost:5432/xicmo?schema=public"),
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
   * Apify actor id that returns Ahrefs-style site data (domain rating,
   * backlinks, organic traffic, top keywords). Defaults to the
   * `radeance/ahrefs-scraper` actor; override to swap providers.
   */
  APIFY_AHREFS_ACTOR_ID: z.string().default("radeance~ahrefs-scraper"),
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

  SENTRY_DSN: z.string().optional(),
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

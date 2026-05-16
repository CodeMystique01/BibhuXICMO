/**
 * Extract a brand's official social handles from its website.
 *
 * Pipeline:
 *  1. Fetch the homepage (existing scraper).
 *  2. Regex-collect every social URL from anchor hrefs + raw HTML
 *     (so footer icons, header nav, JSON-LD, og: tags all count).
 *  3. Pick the most likely "official" candidate per platform with simple
 *     heuristics (frequency + brand-name token match).
 *  4. If Anthropic is configured, ask Claude to pick the canonical handles
 *     from those candidates — better at filtering noise like "share to X"
 *     links, sponsored partner profiles, employee personal accounts, etc.
 *  5. Return the normalized handle/url per platform.
 *
 * No DB writes here — caller is responsible for persisting.
 */
import { z } from "zod";
import { generateObject } from "ai";
import { fetchPage } from "@/backend/scraper/fetch";
import { getModel, isLikelyValidKey } from "@/backend/llm";
import { env } from "@/shared/env";

export type SocialHandles = {
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  youtube?: string;
  github?: string;
  tiktok?: string;
};

export type ExtractionResult = {
  handles: SocialHandles;
  /** "claude" when the LLM disambiguated, "regex" when we used only the heuristic, "empty" when nothing was found. */
  source: "claude" | "regex" | "empty";
  /** Raw candidates per platform — useful for debugging or letting the user pick a different one. */
  candidates: Record<keyof SocialHandles, string[]>;
};

const PLATFORMS: Array<{
  key: keyof SocialHandles;
  // Matches the platform host; capture group 1 is the handle/path.
  pattern: RegExp;
  /** Convert a raw URL into the canonical display value (handle or short URL). */
  normalize: (raw: string) => string | null;
}> = [
  {
    key: "twitter",
    pattern: /https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,30})(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m =
        /https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,30})/i.exec(
          raw
        );
      if (!m) return null;
      const handle = m[1];
      if (RESERVED_TWITTER.has(handle.toLowerCase())) return null;
      return `@${handle}`;
    },
  },
  {
    key: "instagram",
    pattern: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,40})(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m = /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,40})/i.exec(raw);
      if (!m) return null;
      const handle = m[1];
      if (RESERVED_INSTAGRAM.has(handle.toLowerCase())) return null;
      return `@${handle}`;
    },
  },
  {
    key: "linkedin",
    // Matches /company/foo and /school/foo (we exclude personal /in/ profiles
    // because the brand handle on LinkedIn is the company page).
    pattern:
      /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school|showcase)\/([A-Za-z0-9\-._%]+)(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m =
        /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school|showcase)\/([A-Za-z0-9\-._%]+)/i.exec(
          raw
        );
      if (!m) return null;
      return `linkedin.com/company/${decodeURIComponent(m[1])}`;
    },
  },
  {
    key: "facebook",
    pattern:
      /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?!sharer|share|tr|tr\.php|plugins)([A-Za-z0-9.\-]{1,60})(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m =
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?!sharer|share|tr)([A-Za-z0-9.\-]{1,60})/i.exec(
          raw
        );
      if (!m) return null;
      return `facebook.com/${m[1]}`;
    },
  },
  {
    key: "youtube",
    pattern:
      /https?:\/\/(?:www\.)?youtube\.com\/(?:@([A-Za-z0-9_\-.]{3,50})|c\/([A-Za-z0-9_\-.]{3,50})|channel\/([A-Za-z0-9_\-]{3,50})|user\/([A-Za-z0-9_\-.]{3,50}))/gi,
    normalize: (raw) => {
      const at = /youtube\.com\/@([A-Za-z0-9_\-.]+)/i.exec(raw);
      if (at) return `@${at[1]}`;
      const c = /youtube\.com\/(?:c|user)\/([A-Za-z0-9_\-.]+)/i.exec(raw);
      if (c) return `youtube.com/c/${c[1]}`;
      const ch = /youtube\.com\/channel\/([A-Za-z0-9_\-]+)/i.exec(raw);
      if (ch) return `youtube.com/channel/${ch[1]}`;
      return null;
    },
  },
  {
    key: "github",
    pattern: /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9\-]{1,39})(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9\-]{1,39})/i.exec(raw);
      if (!m) return null;
      const handle = m[1];
      if (RESERVED_GITHUB.has(handle.toLowerCase())) return null;
      return handle;
    },
  },
  {
    key: "tiktok",
    pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,40})(?:[/?#\s]|$)/gi,
    normalize: (raw) => {
      const m = /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,40})/i.exec(raw);
      if (!m) return null;
      return `@${m[1]}`;
    },
  },
];

// Path segments that are never a real account handle.
const RESERVED_TWITTER = new Set([
  "share", "intent", "home", "explore", "search", "i", "hashtag", "settings",
  "compose", "messages", "notifications", "login", "signup", "tos", "privacy",
]);
const RESERVED_INSTAGRAM = new Set([
  "explore", "p", "reels", "tv", "stories", "accounts", "directory", "about",
  "developer", "legal", "blog", "press",
]);
const RESERVED_GITHUB = new Set([
  "about", "pricing", "features", "security", "enterprise", "team", "customer-stories",
  "marketplace", "explore", "topics", "trending", "collections", "events",
  "login", "signup", "join", "sponsors", "issues", "pulls", "notifications",
  "settings", "search", "marketplace", "codespaces", "new", "organizations",
]);

const HANDLES_SCHEMA = z.object({
  twitter: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  linkedin: z.string().optional().nullable(),
  facebook: z.string().optional().nullable(),
  youtube: z.string().optional().nullable(),
  github: z.string().optional().nullable(),
  tiktok: z.string().optional().nullable(),
});

export async function extractSocialHandles(
  websiteUrl: string
): Promise<ExtractionResult> {
  const snapshot = await fetchPage(websiteUrl);

  // Build a combined corpus we can regex over:
  //  - every anchor href
  //  - every og:* / twitter:* meta
  //  - raw text of links + body (catches `instagram.com/foo` written without an `<a>` wrapper)
  const linkHrefs = snapshot.links.map((l) => l.href).join("\n");
  const metaValues = Object.values(snapshot.meta).join("\n");
  const corpus = [linkHrefs, metaValues, snapshot.text].join("\n");

  // Collect candidates per platform with simple frequency scoring.
  const candidates = {} as Record<keyof SocialHandles, string[]>;
  for (const p of PLATFORMS) {
    const counts = new Map<string, number>();
    for (const match of corpus.matchAll(p.pattern)) {
      const normalized = p.normalize(match[0]);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    candidates[p.key] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([handle]) => handle);
  }

  const hasAny = Object.values(candidates).some((arr) => arr.length > 0);
  if (!hasAny) {
    return { handles: {}, source: "empty", candidates };
  }

  // Top-1 candidate per platform is the heuristic baseline.
  const heuristic: SocialHandles = {};
  for (const p of PLATFORMS) {
    const top = candidates[p.key][0];
    if (top) heuristic[p.key] = top;
  }

  // If Anthropic isn't configured, return the heuristic answer.
  if (!isLikelyValidKey(env.ANTHROPIC_API_KEY)) {
    return { handles: heuristic, source: "regex", candidates };
  }

  // Ask Claude to pick the canonical brand account from the candidate lists.
  // We send compact candidate lists + a snippet of the page so the model has
  // brand-name context but doesn't burn tokens on a full HTML dump.
  const brandHints = [
    snapshot.title,
    snapshot.description,
    snapshot.h1.slice(0, 3).join(" | "),
  ]
    .filter(Boolean)
    .join("\n");

  const candidateSummary = (Object.keys(candidates) as Array<keyof SocialHandles>)
    .map((k) => {
      const list = candidates[k];
      if (list.length === 0) return `${k}: (none)`;
      return `${k}: ${list.slice(0, 6).join(", ")}`;
    })
    .join("\n");

  const prompt = `You are extracting the official social-media accounts for the company that owns this website.

URL: ${snapshot.url}

Brand context from the page:
${brandHints}

For each platform below, the regex pre-scan found these candidates (in order of how often they appeared on the homepage):

${candidateSummary}

Return one canonical handle per platform.

Rules:
- Prefer the candidate that appears MULTIPLE times on the homepage — those are the footer/header social icons and are almost always the brand's own accounts.
- A handle whose slug contains or closely matches the brand name (e.g. brand "Anthropic" → "@AnthropicAI", "linkedin.com/company/anthropicresearch") IS the official account. Don't reject these for being non-exact.
- Use the EXACT string from the candidate list — do not invent or rewrite handles.
- Return null only when the candidate is clearly NOT the brand's account (e.g. unrelated partner, share-intent URL like "share.html", random employee personal profile).
- When there is exactly one candidate for a platform AND it appears at least once on the page, return it.
- Twitter/Instagram/TikTok handles should be like "@handle".
- LinkedIn should be like "linkedin.com/company/slug".
- YouTube should be like "@handle" or "youtube.com/c/slug" or "youtube.com/channel/UCxxxx".
- GitHub should be a plain org name like "anthropics".
- Facebook should be like "facebook.com/slug".`;

  try {
    const { object } = await generateObject({
      model: getModel("claude-sonnet-4-6"),
      schema: HANDLES_SCHEMA,
      prompt,
      // Cheap + bounded — this is a tiny structured-output task.
      maxRetries: 1,
    });

    const handles: SocialHandles = {};
    for (const k of Object.keys(object) as Array<keyof SocialHandles>) {
      const v = object[k];
      if (v && typeof v === "string" && v.trim()) handles[k] = v.trim();
    }
    return { handles, source: "claude", candidates };
  } catch {
    return { handles: heuristic, source: "regex", candidates };
  }
}

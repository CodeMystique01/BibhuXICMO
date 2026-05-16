import * as cheerio from "cheerio";
import { env } from "@/shared/env";
import { CRAWLER_PRODUCT_TOKEN } from "@/shared/site";

export type PageSnapshot = {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  text: string;
  wordCount: number;
  images: { src: string; alt: string | null }[];
  links: { href: string; text: string; internal: boolean }[];
  ogImage?: string;
  jsonLd: unknown[];
  status: number;
  lang?: string;
  meta: Record<string, string>;
};

const FETCH_TIMEOUT_MS = 12_000;

/**
 * Fetches and parses HTML marketing pages for onboarding / SEO agents.
 */
export class SiteScrapePipeline {
  constructor(private readonly fetchTimeoutMs = FETCH_TIMEOUT_MS) {}

  private get userAgent(): string {
    const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    return `Mozilla/5.0 (compatible; ${CRAWLER_PRODUCT_TOKEN}; +${origin}/bot)`;
  }

  normalizeUrl(input: string): string {
    let u = input.trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      const url = new URL(u);
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return u;
    }
  }

  async fetchPage(url: string): Promise<PageSnapshot> {
    const normalized = this.normalizeUrl(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.fetchTimeoutMs);

    try {
      const res = await fetch(normalized, {
        headers: { "User-Agent": this.userAgent, Accept: "text/html,application/xhtml+xml" },
        signal: ctrl.signal,
        redirect: "follow",
      });

      const html = await res.text();
      return this.parseHtml(normalized, html, res.status);
    } finally {
      clearTimeout(timer);
    }
  }

  parseHtml(url: string, html: string, status: number): PageSnapshot {
    const $ = cheerio.load(html);
    const origin = new URL(url).origin;

    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";

    const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    const h2 = $("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean);

    $("script,style,noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = text ? text.split(" ").length : 0;

    const images = $("img")
      .map((_, el) => {
        const $el = $(el);
        return {
          src: $el.attr("src") || "",
          alt: $el.attr("alt") ?? null,
        };
      })
      .get()
      .filter((i) => i.src);

    const links = $("a[href]")
      .map((_, el) => {
        const $el = $(el);
        const href = $el.attr("href") || "";
        const text = $el.text().replace(/\s+/g, " ").trim();
        let internal = false;
        try {
          const u = new URL(href, url);
          internal = u.origin === origin;
        } catch {
          /* ignore */
        }
        return { href, text, internal };
      })
      .get()
      .filter((l) => l.href && !l.href.startsWith("#") && !l.href.startsWith("mailto:"));

    const ogImage =
      $('meta[property="og:image"]').attr("content")?.trim() || undefined;

    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).text());
        jsonLd.push(parsed);
      } catch {
        /* ignore */
      }
    });

    const meta: Record<string, string> = {};
    $("meta").each((_, el) => {
      const $el = $(el);
      const name = $el.attr("name") || $el.attr("property");
      const content = $el.attr("content");
      if (name && content) meta[name] = content;
    });

    return {
      url,
      title,
      description,
      h1,
      h2,
      text: text.slice(0, 20_000),
      wordCount,
      images: images.slice(0, 40),
      links: links.slice(0, 200),
      ogImage,
      jsonLd,
      status,
      lang: $("html").attr("lang") || undefined,
      meta,
    };
  }
}

export const siteScrapePipeline = new SiteScrapePipeline();

/** When fetch fails (timeout, block, TLS), strategy/onboarding can still continue with a minimal snapshot. */
export function emptyPageSnapshot(url: string, status = 0): PageSnapshot {
  const normalized = siteScrapePipeline.normalizeUrl(url);
  return {
    url: normalized,
    title: "",
    description: "",
    h1: [],
    h2: [],
    text: "",
    wordCount: 0,
    images: [],
    links: [],
    jsonLd: [],
    status,
    meta: {},
  };
}

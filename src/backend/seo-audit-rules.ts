/**
 * Rule-based SEO audit. No LLM, no DB, no credits — runs purely from a
 * `PageSnapshot` returned by the site-scrape pipeline. Used by:
 *
 * - The SEO agent's fallback path when no LLM key is configured
 * - The public `/api/public/site-audit` endpoint (lead-gen preview)
 */
import type { PageSnapshot } from "@/backend/scraper/fetch";

export type AuditSeverity = "low" | "medium" | "high";

export type AuditIssue = {
  severity: AuditSeverity;
  category: "meta" | "content" | "accessibility" | "schema" | "performance";
  title: string;
  fix: string;
};

export type RuleAuditResult = {
  score: number;
  issues: AuditIssue[];
  highlights: { label: string; value: string }[];
};

export function ruleBasedAudit(snap: PageSnapshot): RuleAuditResult {
  const issues: AuditIssue[] = [];

  if (!snap.title) {
    issues.push({
      severity: "high",
      category: "meta",
      title: "Missing <title>",
      fix: "Add a descriptive <title> tag (50-60 characters).",
    });
  } else if (snap.title.length > 65) {
    issues.push({
      severity: "medium",
      category: "meta",
      title: "Title too long",
      fix: "Keep the title under 60 characters so it doesn't get truncated in SERPs.",
    });
  } else if (snap.title.length < 25) {
    issues.push({
      severity: "low",
      category: "meta",
      title: "Title is short",
      fix: "Expand the title to 50-60 characters with your primary keyword and value prop.",
    });
  }

  if (!snap.description) {
    issues.push({
      severity: "high",
      category: "meta",
      title: "Missing meta description",
      fix: "Write a 140-160 character description that summarizes the page's value prop.",
    });
  } else if (snap.description.length > 165) {
    issues.push({
      severity: "low",
      category: "meta",
      title: "Meta description too long",
      fix: "Keep the description under 160 characters; Google will truncate it.",
    });
  } else if (snap.description.length < 80) {
    issues.push({
      severity: "low",
      category: "meta",
      title: "Meta description is thin",
      fix: "Aim for 140-160 characters — short descriptions are often rewritten by Google.",
    });
  }

  if (snap.h1.length === 0) {
    issues.push({
      severity: "high",
      category: "content",
      title: "Missing H1",
      fix: "Add exactly one H1 that names the page topic.",
    });
  } else if (snap.h1.length > 1) {
    issues.push({
      severity: "medium",
      category: "content",
      title: `Multiple H1s (${snap.h1.length})`,
      fix: "Keep a single H1 per page; demote the others to H2/H3.",
    });
  }

  const noAlt = snap.images.filter((i) => !i.alt).length;
  if (noAlt > 0) {
    issues.push({
      severity: noAlt > 5 ? "medium" : "low",
      category: "accessibility",
      title: `${noAlt} image${noAlt === 1 ? "" : "s"} without alt text`,
      fix: "Add descriptive alt attributes to every meaningful image.",
    });
  }

  if (snap.jsonLd.length === 0) {
    issues.push({
      severity: "low",
      category: "schema",
      title: "No structured data",
      fix: "Add JSON-LD for Organization, WebSite, or Product — LLM crawlers weight this heavily for citations.",
    });
  }

  if (snap.wordCount < 250) {
    issues.push({
      severity: "medium",
      category: "content",
      title: "Thin content",
      fix: "Expand to at least 400-600 words and cover the topic in depth.",
    });
  }

  if (!snap.lang) {
    issues.push({
      severity: "low",
      category: "meta",
      title: "Missing <html lang>",
      fix: "Set the lang attribute on <html> (e.g. lang='en') for accessibility and i18n.",
    });
  }

  if (snap.status >= 400) {
    issues.push({
      severity: "high",
      category: "performance",
      title: `HTTP ${snap.status} response`,
      fix: "The page returned an error status. Check redirects, server logs, and DNS.",
    });
  }

  // Score: start at 100, weight by severity.
  const penalty = issues.reduce((p, i) => {
    if (i.severity === "high") return p + 18;
    if (i.severity === "medium") return p + 9;
    return p + 3;
  }, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const highlights: { label: string; value: string }[] = [
    { label: "Title", value: snap.title || "(missing)" },
    {
      label: "Description",
      value: snap.description ? `${snap.description.length} chars` : "(missing)",
    },
    { label: "H1 count", value: String(snap.h1.length) },
    { label: "Word count", value: String(snap.wordCount) },
    { label: "Images", value: String(snap.images.length) },
    { label: "Internal links", value: String(snap.links.filter((l) => l.internal).length) },
    { label: "JSON-LD blocks", value: String(snap.jsonLd.length) },
    { label: "Language", value: snap.lang || "(not set)" },
  ];

  return { score, issues, highlights };
}

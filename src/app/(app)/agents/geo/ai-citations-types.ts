/**
 * Shared types + constants for the GEO AI citations dashboard.
 *
 * Kept in a non-"use server" file because Next.js requires server action
 * files to only export async functions.
 */

export type PlatformKey =
  | "aiOverviews"
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "copilot"
  | "grok";

export const PLATFORMS: ReadonlyArray<{
  key: PlatformKey;
  label: string;
  /** Tailwind text color used by the platform icon. */
  color: string;
}> = [
  { key: "aiOverviews", label: "AI Overviews", color: "text-sky-400" },
  { key: "chatgpt", label: "ChatGPT", color: "text-zinc-100" },
  { key: "gemini", label: "Gemini", color: "text-violet-400" },
  { key: "perplexity", label: "Perplexity", color: "text-teal-400" },
  { key: "copilot", label: "Copilot", color: "text-amber-400" },
  { key: "grok", label: "Grok", color: "text-zinc-300" },
];

export type PlatformCounts = {
  citations: number;
  pages: number;
};

export type AiCitationsBundle = {
  domain: string;
  country: string;
  fetchedAt: string;
  previousAt: string | null;
  current: Partial<Record<PlatformKey, PlatformCounts>>;
  previous: Partial<Record<PlatformKey, PlatformCounts>>;
};

export type AiCitationsActionResult =
  | { ok: true; data: AiCitationsBundle | null }
  | { ok: false; error: string };

import { openai, createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText, generateObject, streamText, type LanguageModel } from "ai";
import type { z } from "zod";
import { env } from "@/shared/env";
import { chargeCredits, MODEL_CREDIT_COST } from "@/backend/credits";

export type SupportedModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  // Anthropic — current production lineup (May 2026). The old 3.5-* names
  // were retired by Anthropic on Oct 28, 2025; we keep them as legacy
  // aliases so existing ChatSession rows in the DB don't break.
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-opus-4-7"
  | "claude-3-5-sonnet"
  | "claude-3-5-haiku"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro"
  | "perplexity-sonar"
  | "perplexity-sonar-pro"
  | "openrouter:gpt-4o-mini"
  | "openrouter:claude-sonnet-4-6"
  | "openrouter:claude-3-5-sonnet";

export const DEFAULT_MODEL: SupportedModel = "gpt-4o-mini";

/** Primary model for /agent/cmo (analytics panel, LLM snapshot, dock chat, tool agents). */
export const CMO_PREFERRED_MODEL: SupportedModel = "claude-sonnet-4-6";

/**
 * Lazy clients — created on first use so they only read env when needed.
 */
let _perplexity: ReturnType<typeof createOpenAI> | null = null;
let _openrouter: ReturnType<typeof createOpenAI> | null = null;

function perplexity() {
  if (_perplexity) return _perplexity;
  _perplexity = createOpenAI({
    baseURL: "https://api.perplexity.ai",
    apiKey: env.PERPLEXITY_API_KEY,
    name: "perplexity",
  });
  return _perplexity;
}

function openrouter() {
  if (_openrouter) return _openrouter;
  _openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: env.OPENROUTER_API_KEY,
    name: "openrouter",
    // OpenRouter recommends a Referer + Title for analytics.
    headers: {
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
      "X-Title": "Xicmo",
    },
  });
  return _openrouter;
}

export function getModel(name: SupportedModel = DEFAULT_MODEL): LanguageModel {
  switch (name) {
    case "gpt-4o":
      return openai("gpt-4o");
    case "gpt-4o-mini":
      return openai("gpt-4o-mini");

    case "claude-sonnet-4-6":
    case "claude-3-5-sonnet": // legacy alias — Anthropic retired the old IDs
      return anthropic("claude-sonnet-4-6");
    case "claude-haiku-4-5":
    case "claude-3-5-haiku": // legacy alias — Anthropic retired the old IDs
      return anthropic("claude-haiku-4-5");
    case "claude-opus-4-7":
      return anthropic("claude-opus-4-7");

    case "gemini-1.5-flash":
      return google("gemini-1.5-flash-latest");
    case "gemini-1.5-pro":
      return google("gemini-1.5-pro-latest");
    case "perplexity-sonar":
      return perplexity()("sonar");
    case "perplexity-sonar-pro":
      return perplexity()("sonar-pro");
    case "openrouter:gpt-4o-mini":
      return openrouter()("openai/gpt-4o-mini");
    case "openrouter:claude-sonnet-4-6":
    case "openrouter:claude-3-5-sonnet": // legacy alias
      return openrouter()("anthropic/claude-sonnet-4.6");
  }
}

/**
 * Reject obvious placeholder / stub keys so we don't pretend a provider is
 * available and then explode on the first request. Real keys have high
 * entropy; placeholders typically repeat substrings or sequential alphabet.
 */
export function isLikelyValidKey(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const k = raw.trim();
  if (k.length < 16) return false;

  const lower = k.toLowerCase();
  if (lower.startsWith("replace_") || lower.startsWith("your-") || lower.startsWith("xxx")) {
    return false;
  }

  // Strip provider prefix and non-alpha so we can analyze entropy of the body.
  const body = lower
    .replace(/^sk-(?:proj-|ant-|live-|test-)?/, "")
    .replace(/[^a-z0-9]/g, "");
  if (body.length < 12) return false;

  // Repeating-substring placeholders (e.g. "mnopqrstuvwxabcd" repeated twice
  // — that's exactly the example in our .env.example).
  for (let len = 6; len <= 16; len++) {
    if (body.length < len * 2) break;
    const head = body.slice(0, len);
    if (body.slice(len, len * 2) === head) return false;
  }

  // Long sequential alphabet runs (abcdefghij…) are placeholders, not entropy.
  let seqRun = 1;
  for (let i = 1; i < body.length; i++) {
    if (body.charCodeAt(i) === body.charCodeAt(i - 1) + 1) {
      seqRun++;
      if (seqRun >= 8) return false;
    } else {
      seqRun = 1;
    }
  }

  // Distinct-character ratio: real high-entropy keys usually have 16+ unique
  // chars in the first 32. Pure-placeholder strings drop way below that.
  const sample = body.slice(0, 32);
  const distinct = new Set(sample.split("")).size;
  if (sample.length >= 24 && distinct < 12) return false;

  return true;
}

export function hasApiKey(model: SupportedModel): boolean {
  if (model.startsWith("openrouter:")) return isLikelyValidKey(env.OPENROUTER_API_KEY);
  if (model.startsWith("gpt")) return isLikelyValidKey(env.OPENAI_API_KEY);
  if (model.startsWith("claude")) return isLikelyValidKey(env.ANTHROPIC_API_KEY);
  if (model.startsWith("gemini")) return isLikelyValidKey(env.GOOGLE_GEMINI_API_KEY);
  if (model.startsWith("perplexity")) return isLikelyValidKey(env.PERPLEXITY_API_KEY);
  return false;
}

/**
 * Provider preference order. Anthropic comes first when its key is configured
 * — the AI CMO is intentionally Claude-first (better tool-call reliability,
 * longer answers, fewer empty turns). OpenAI is the secondary fallback.
 */
function defaultProviderOrder(): SupportedModel[] {
  const out: SupportedModel[] = [];
  if (isLikelyValidKey(env.ANTHROPIC_API_KEY)) {
    out.push("claude-sonnet-4-6", "claude-haiku-4-5");
  }
  if (isLikelyValidKey(env.OPENAI_API_KEY)) {
    out.push("gpt-4o-mini", "gpt-4o");
  }
  if (isLikelyValidKey(env.GOOGLE_GEMINI_API_KEY)) {
    out.push("gemini-1.5-flash", "gemini-1.5-pro");
  }
  if (isLikelyValidKey(env.OPENROUTER_API_KEY)) {
    out.push("openrouter:claude-sonnet-4-6", "openrouter:gpt-4o-mini");
  }
  if (isLikelyValidKey(env.PERPLEXITY_API_KEY)) {
    out.push("perplexity-sonar");
  }
  return out;
}

/**
 * Pick a model that actually has API credentials configured.
 * Returns null if nothing is configured.
 */
export function pickAvailableModel(
  preferred: SupportedModel = DEFAULT_MODEL
): SupportedModel | null {
  const candidates: SupportedModel[] = [preferred, ...defaultProviderOrder()];
  const seen = new Set<SupportedModel>();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (hasApiKey(c)) return c;
  }
  return null;
}

/**
 * Return every available model in priority order. Used by `runWithFallback`
 * to retry the next provider when one returns auth/rate-limit/network errors.
 */
export function listFallbackModels(
  preferred: SupportedModel = DEFAULT_MODEL
): SupportedModel[] {
  const ordered = [preferred, ...defaultProviderOrder()];
  const seen = new Set<SupportedModel>();
  const out: SupportedModel[] = [];
  for (const c of ordered) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (hasApiKey(c)) out.push(c);
  }
  return out;
}

/**
 * For GEO probing: every distinct provider that has a key. We want a *provider*
 * spread, not a model count, so the GEO score reflects multiple LLMs.
 */
export function listAvailableProviders(): SupportedModel[] {
  const out: SupportedModel[] = [];
  if (isLikelyValidKey(env.ANTHROPIC_API_KEY)) out.push("claude-haiku-4-5");
  if (isLikelyValidKey(env.OPENAI_API_KEY)) out.push("gpt-4o-mini");
  if (isLikelyValidKey(env.GOOGLE_GEMINI_API_KEY)) out.push("gemini-1.5-flash");
  if (isLikelyValidKey(env.PERPLEXITY_API_KEY)) out.push("perplexity-sonar");
  return out;
}

type MeteredOptions = {
  workspaceId: string;
  reason: string;
  model?: SupportedModel;
};

/**
 * Errors that mean "this provider is broken — try the next one". Anything
 * else (e.g. a zod validation failure inside generateObject) is a real bug
 * and we re-throw immediately.
 */
function isRetryableProviderError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const status =
    (err as { statusCode?: number; status?: number }).statusCode ??
    (err as { statusCode?: number; status?: number }).status;
  if (status === 401 || status === 403 || status === 404 || status === 429) return true;
  if (status != null && status >= 500 && status < 600) return true;
  return (
    msg.includes("api key") ||
    msg.includes("apikey") ||
    msg.includes("unauthorized") ||
    msg.includes("authentication") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("insufficient") ||
    msg.includes("credit balance") ||
    msg.includes("low balance") ||
    msg.includes("billing") ||
    msg.includes("payment required") ||
    msg.includes("plans & billing") ||
    msg.includes("model_not_found") ||
    msg.includes("not_found_error") ||
    msg.includes("overloaded") ||
    msg.includes("connection") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

/**
 * Run `fn` against the preferred model; if it fails with a retryable provider
 * error, try the next configured provider until one succeeds. Returns the
 * value of the successful run plus the model that produced it.
 */
export async function runWithFallback<T>(
  preferred: SupportedModel | null | undefined,
  fn: (model: SupportedModel) => Promise<T>,
  opts: { reason?: string } = {}
): Promise<{ value: T; model: SupportedModel; tried: SupportedModel[] }> {
  const candidates = listFallbackModels(preferred ?? DEFAULT_MODEL);
  if (candidates.length === 0) {
    throw new Error(
      "No LLM provider configured. Add ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY."
    );
  }

  const tried: SupportedModel[] = [];
  let lastErr: unknown = null;
  for (const model of candidates) {
    tried.push(model);
    try {
      const value = await fn(model);
      return { value, model, tried };
    } catch (err) {
      lastErr = err;
      if (!isRetryableProviderError(err)) {
        throw err;
      }
      console.warn(
        `[llm] ${opts.reason ?? "request"} failed on ${model}; trying next provider:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const why =
    lastErr instanceof Error ? lastErr.message : "all providers failed";
  throw new Error(
    `All configured LLM providers failed (${tried.join(", ")}). Last error: ${why}`
  );
}

export async function meteredGenerateText(
  prompt: string,
  opts: MeteredOptions & { system?: string }
) {
  const preferred = opts.model ?? DEFAULT_MODEL;
  const { value: result, model } = await runWithFallback(
    preferred,
    async (m) =>
      generateText({
        model: getModel(m),
        system: opts.system,
        prompt,
      }),
    { reason: opts.reason }
  );

  const tokens = result.usage?.totalTokens ?? 0;
  const cost = MODEL_CREDIT_COST[model] ?? 1;
  await chargeCredits({
    workspaceId: opts.workspaceId,
    credits: cost,
    reason: opts.reason,
    model,
    tokens,
  });

  return { text: result.text, usage: result.usage, model };
}

export async function meteredGenerateObject<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: MeteredOptions & { system?: string }
): Promise<{ object: T; model: SupportedModel }> {
  const preferred = opts.model ?? DEFAULT_MODEL;
  const { value: result, model } = await runWithFallback(
    preferred,
    async (m) =>
      generateObject({
        model: getModel(m),
        system: opts.system,
        prompt,
        schema,
      }),
    { reason: opts.reason }
  );

  const tokens = result.usage?.totalTokens ?? 0;
  const cost = MODEL_CREDIT_COST[model] ?? 1;
  await chargeCredits({
    workspaceId: opts.workspaceId,
    credits: cost,
    reason: opts.reason,
    model,
    tokens,
  });

  return { object: result.object as T, model };
}

export { streamText };

/**
 * Hero image generation for blog drafts via Google Gemini.
 *
 * Tries several image-capable models in order. Google has shuffled the
 * names a few times (gemini-2.0-flash-exp -> 2.0-flash-preview-image
 * -> 2.5-flash-image -> Imagen-3, depending on rollout / region), so
 * we attempt them serially and use the first one that returns inline
 * image data.
 *
 * Returns null on any failure — the draft is still saved without an
 * image and the user can re-roll later.
 */
import { env } from "@/shared/env";

export type HeroImage = { url: string; alt: string };

/** Ordered list of model IDs to try. First success wins. */
const CANDIDATE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
];

const TIMEOUT_MS = 45_000;

export async function generateHeroImage(args: {
  title: string;
  keyword: string;
  blogType: "listicle" | "descriptive";
}): Promise<HeroImage | null> {
  if (!env.GOOGLE_GEMINI_API_KEY) {
    console.warn("[image-gen] skipped: GOOGLE_GEMINI_API_KEY not set");
    return null;
  }
  const prompt = buildPrompt(args);

  for (const model of CANDIDATE_MODELS) {
    const result = await tryModel(model, prompt);
    if (result.kind === "ok") {
      return { url: result.dataUri, alt: args.title };
    }
    // Log per-model failure so we can see WHICH ones are unavailable for this account.
    console.warn(
      `[image-gen] ${model} -> ${result.reason}${result.detail ? `: ${result.detail.slice(0, 200)}` : ""}`
    );
    // Don't bother trying more models if the key itself was rejected.
    if (result.kind === "fatal") return null;
  }
  return null;
}

type ModelResult =
  | { kind: "ok"; dataUri: string }
  | { kind: "soft"; reason: string; detail?: string }
  | { kind: "fatal"; reason: string; detail?: string };

async function tryModel(model: string, prompt: string): Promise<ModelResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GOOGLE_GEMINI_API_KEY!)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Both modalities — some model revisions require TEXT to be present.
      responseModalities: ["TEXT", "IMAGE"],
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // 400 / 404 usually = model not available; 401 / 403 = bad key (fatal).
      if (res.status === 401 || res.status === 403) {
        return { kind: "fatal", reason: `HTTP ${res.status}`, detail: text };
      }
      return { kind: "soft", reason: `HTTP ${res.status}`, detail: text };
    }
    let json: GeminiImageResponse;
    try {
      json = JSON.parse(text) as GeminiImageResponse;
    } catch {
      return { kind: "soft", reason: "non-JSON response", detail: text };
    }
    const inline = json.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    )?.inlineData;
    if (!inline?.data) {
      return { kind: "soft", reason: "no inlineData in response" };
    }
    const mime = inline.mimeType || "image/png";
    return { kind: "ok", dataUri: `data:${mime};base64,${inline.data}` };
  } catch (err) {
    const e = err as Error;
    return {
      kind: "soft",
      reason: e.name === "AbortError" ? "timeout" : "fetch error",
      detail: e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(args: {
  title: string;
  keyword: string;
  blogType: "listicle" | "descriptive";
}): string {
  const style =
    args.blogType === "listicle"
      ? "Vibrant editorial illustration suitable as a blog post hero. Composition implies a ranked selection or comparison — multiple distinct items arranged tastefully. No text, no logos."
      : "Clean editorial illustration suitable as a long-form article hero. Conceptual, modern, soft gradients. No text, no logos.";

  return [
    `Generate a 16:9 hero image for an article titled "${args.title}".`,
    `Topic keyword: "${args.keyword}".`,
    style,
    "Avoid: stock-photo cliches, watermarks, signatures, or any embedded text.",
  ].join("\n");
}

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

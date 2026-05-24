/**
 * Image generation for blog drafts via Google Gemini.
 *
 * Three helpers — same underlying model fallback, different prompts:
 *   - generateHeroImage()     -> 16:9 banner used at the top of a draft
 *   - generateItemImage()     -> square thumbnail for each listicle item
 *   - generateSectionImage()  -> wide editorial illustration for a
 *                                 long-form article section
 *
 * Tries several image-capable models in order. Google has shuffled the
 * names a few times (gemini-2.0-flash-exp -> 2.0-flash-preview-image
 * -> 2.5-flash-image), so we attempt them serially and use the first
 * one that returns inline image data.
 *
 * Returns null on any failure — never throws. Callers should treat
 * null as "skip the image, save the draft anyway".
 */
import { env } from "@/shared/env";

export type GeneratedImage = { url: string; alt: string };

/** Ordered list of model IDs to try. First success wins. */
const CANDIDATE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
];

const TIMEOUT_MS = 45_000;

// -----------------------------------------------------------------
//  Public helpers
// -----------------------------------------------------------------

export async function generateHeroImage(args: {
  title: string;
  keyword: string;
  blogType: "listicle" | "descriptive";
}): Promise<GeneratedImage | null> {
  const style =
    args.blogType === "listicle"
      ? "Vibrant editorial illustration suitable as a blog post hero. Composition implies a ranked selection or comparison — multiple distinct items arranged tastefully. No text, no logos."
      : "Clean editorial illustration suitable as a long-form article hero. Conceptual, modern, soft gradients. No text, no logos.";
  return runGeneration({
    alt: args.title,
    prompt: [
      `Generate a 16:9 hero image for an article titled "${args.title}".`,
      `Topic keyword: "${args.keyword}".`,
      style,
      "Avoid: stock-photo cliches, watermarks, signatures, or any embedded text.",
    ].join("\n"),
  });
}

export async function generateItemImage(args: {
  itemName: string;
  itemDescription: string;
  parentKeyword: string;
  rank: number;
}): Promise<GeneratedImage | null> {
  return runGeneration({
    alt: args.itemName,
    prompt: [
      `Generate a square (1:1) editorial illustration that represents "${args.itemName}".`,
      `Context: it is item #${args.rank} in an article about "${args.parentKeyword}".`,
      `What it does: ${args.itemDescription.slice(0, 300)}.`,
      "Visual style: vibrant, modern, abstract conceptual — NOT a logo or screenshot.",
      "Avoid: any embedded text, the brand's actual logo, watermarks, or signatures.",
      "Avoid stock-photo cliches; lean into a singular evocative concept.",
    ].join("\n"),
  });
}

export async function generateSectionImage(args: {
  sectionTitle: string;
  parentKeyword: string;
  bodySnippet: string;
}): Promise<GeneratedImage | null> {
  return runGeneration({
    alt: args.sectionTitle,
    prompt: [
      `Generate a 16:9 editorial illustration for a long-form article section titled "${args.sectionTitle}".`,
      `Article topic: "${args.parentKeyword}".`,
      `Section context: ${args.bodySnippet.slice(0, 400)}`,
      "Visual style: modern, conceptual, soft gradients. Single clear focal point.",
      "Avoid: stock-photo cliches, watermarks, signatures, embedded text, or recognisable logos.",
    ].join("\n"),
  });
}

// -----------------------------------------------------------------
//  Shared model-fallback runner
// -----------------------------------------------------------------

async function runGeneration(args: {
  prompt: string;
  alt: string;
}): Promise<GeneratedImage | null> {
  if (!env.GOOGLE_GEMINI_API_KEY) {
    console.warn("[image-gen] skipped: GOOGLE_GEMINI_API_KEY not set");
    return null;
  }
  for (const model of CANDIDATE_MODELS) {
    const result = await tryModel(model, args.prompt);
    if (result.kind === "ok") {
      return { url: result.dataUri, alt: args.alt };
    }
    console.warn(
      `[image-gen] ${model} -> ${result.reason}${result.detail ? `: ${result.detail.slice(0, 150)}` : ""}`
    );
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
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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

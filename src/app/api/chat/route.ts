import { NextResponse, type NextRequest } from "next/server";
import { generateText, type CoreMessage } from "ai";
import { z } from "zod";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import {
  getModel,
  pickAvailableModel,
  runWithFallback,
} from "@/backend/llm";
import { getBalance, chargeCredits, MODEL_CREDIT_COST } from "@/backend/credits";
import { getEffectivePlan } from "@/backend/plan";
import { loadCmoFastData, type CmoFastData } from "@/backend/agents/cmo-data";
import { rateLimitAsync, ipKey } from "@/backend/rate-limit";
import { buildCmoTools } from "@/backend/agents/cmo-tools";
import { SITE_NAME } from "@/shared/site";

export const runtime = "nodejs";
// Tool calls run scrapers + LLM; allow up to 60s.
export const maxDuration = 60;

const bodySchema = z.object({
  sessionId: z.string().optional(),
  /** When `"cmo"`, defaults to Claude-first routing for /agent/cmo chat dock. */
  source: z.enum(["cmo", "app"]).optional(),
  model: z
    .enum([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-opus-4-7",
      // legacy aliases — accepted so existing chats with stored model names
      // still validate; getModel() routes them to current Anthropic IDs.
      "claude-3-5-sonnet",
      "claude-3-5-haiku",
    ] as const)
    .optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
});

const GEN_TIMEOUT_MS = 50_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("chat_timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Compact, DB-only snapshot of the workspace's live data for grounding. */
function snapshotText(fast: CmoFastData): string {
  const lines: string[] = [];
  lines.push(`SEO score: ${fast.scores.seo ?? "n/a"} · GEO score: ${fast.scores.geo ?? "n/a"}.`);
  const a = fast.workspace.ahrefsSnapshot as Record<string, unknown> | null;
  if (a && typeof a === "object") {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = a[k];
        if (typeof v === "number" || (typeof v === "string" && v.trim())) return v;
      }
      return null;
    };
    const dr = get("domainRating", "dr", "domain_rating");
    const backlinks = get("backlinks", "totalBacklinks", "backlinksCount");
    const refDomains = get("referringDomains", "refdomains", "refDomains", "referring_domains");
    const rank = get("ahrefsRank", "ahrefs_rank");
    const dofollowBl = get("dofollowBacklinks", "dofollow_backlinks");
    const dofollowRd = get("dofollowReferringDomains", "dofollowRefdomains", "dofollow_refdomains");
    const traffic = get("traffic", "organicTraffic", "orgTraffic");
    const parts: string[] = [];
    if (dr != null) parts.push(`Domain Rating ${dr}/100`);
    if (backlinks != null) parts.push(`${backlinks} total backlinks`);
    if (refDomains != null) parts.push(`${refDomains} referring domains`);
    if (dofollowBl != null) parts.push(`${dofollowBl} dofollow backlinks`);
    if (dofollowRd != null) parts.push(`${dofollowRd} dofollow referring domains`);
    if (rank != null) parts.push(`Ahrefs Rank #${rank}`);
    if (traffic != null) parts.push(`~${traffic} est. monthly organic traffic`);
    if (parts.length) lines.push(`Backlink / authority profile (Ahrefs): ${parts.join(", ")}.`);
    else lines.push("Backlink profile: no Ahrefs snapshot captured yet — open the AI CMO once to populate it, or run the SEO Agent.");
  } else {
    lines.push("Backlink profile: no Ahrefs snapshot captured yet — open the AI CMO once to populate it, or run the SEO Agent.");
  }
  if (fast.topKeywords.length) {
    lines.push(`Top keywords: ${fast.topKeywords.slice(0, 8).map((k) => k.query).join(", ")}.`);
  }
  if (fast.topCompetitors.length) {
    lines.push(`Competitors: ${fast.topCompetitors.slice(0, 6).join(", ")}.`);
  }
  if (fast.topIssues.length) {
    lines.push(`Top SEO issues: ${fast.topIssues.slice(0, 5).map((i) => i.title).join("; ")}.`);
  }
  if (fast.openActions.length) {
    lines.push(`Open action items: ${fast.openActions.slice(0, 5).map((x) => x.title).join("; ")}.`);
  }
  if (fast.recentRuns.length) {
    lines.push(`Recent agent runs: ${fast.recentRuns.slice(0, 5).map((r) => `${r.agent} (${r.status.toLowerCase()})`).join(", ")}.`);
  }
  const connected = Object.entries(fast.integrations).filter(([, v]) => v).map(([k]) => k);
  lines.push(`Connected integrations: ${connected.length ? connected.join(", ") : "none"}.`);
  return lines.join("\n");
}

function buildSystemPrompt(args: {
  workspaceName: string;
  websiteUrl: string | null;
  industry: string | null;
  icp: string | null;
  dataSnapshot: string;
}): string {
  const lines = [
    `You are the AI CMO inside ${SITE_NAME}, the marketing co-pilot for ${args.workspaceName}.`,
    `Workspace website: ${args.websiteUrl ?? "(not set yet)"}.`,
    args.industry ? `Industry: ${args.industry}.` : null,
    args.icp ? `Target customer: ${args.icp}.` : null,
    "",
    "WORKSPACE DATA SNAPSHOT (the user's live data — your PRIMARY source, answer from this):",
    args.dataSnapshot || "(no data yet — the user hasn't run any audits or scans).",
    "",
    "GROUNDING RULES (strict):",
    `- Answer ONLY about this workspace's marketing, using the snapshot above and your tools. Cite the actual numbers from the data. NEVER invent data and NEVER answer from outside/general knowledge.`,
    "- For questions about EXISTING data (SEO/GEO scores, backlinks, keywords, competitors, issues, actions, recent runs), answer immediately from the snapshot. Do NOT call any tool for these — reply right away.",
    "- Call a tool ONLY when the user explicitly asks to RUN something or pastes a URL: analyze_url (a pasted URL), run_seo_agent (run an SEO audit), run_geo_agent (GEO / 'do AIs cite us'), find_reddit_threads / find_hn_threads, draft_x_post / draft_linkedin_post / write_article, gsc_top_queries.",
    "- If the snapshot lacks the data they ask about (e.g. no backlink snapshot yet), say so plainly and suggest the action that would populate it — do not stall on a slow tool.",
    `- If a request is unrelated to this workspace's marketing (trivia, coding, world facts), politely say you only help with their ${SITE_NAME} marketing data and agents, and suggest a relevant action.`,
    "- After any tool runs, always write a short summary in your own words (never end with only tool calls and no text).",
    "- Keep replies tight: lead with the answer, then a short bullet list of evidence, then one suggested next action.",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  const { workspace, user } = await requireWorkspace({ skipOnboardingCheck: true });

  const limited = await rateLimitAsync(ipKey(req, `chat:${user.id}`), {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { messages, sessionId: incomingId } = parsed.data;
  // The AI CMO dock and Private Chat both run on OpenAI GPT, grounded strictly
  // on this workspace's data. The model is fixed (not user-selectable).
  const preferred = "gpt-4o-mini" as const;
  const initialPick = pickAvailableModel(preferred);

  if (!initialPick) {
    return NextResponse.json(
      { error: "The assistant isn't available right now. Please try again later." },
      { status: 503 }
    );
  }

  let session = incomingId
    ? await prisma.chatSession.findFirst({
        where: { id: incomingId, userId: user.id },
      })
    : null;

  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        model: initialPick,
        title: messages[0]?.content.slice(0, 80) ?? "New chat",
      },
    });
  }

  // Persist the last user message
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "user",
        content: lastUser.content,
      },
    });
  }

  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools = buildCmoTools(workspace.id);

  // Fast, DB-only workspace snapshot so the assistant answers grounded
  // questions instantly without waiting on slow scraper tools.
  let dataSnapshot = "";
  try {
    const credits = await getBalance(workspace.id).catch(() => null);
    const fast = await loadCmoFastData({
      workspaceId: workspace.id,
      websiteUrl: workspace.websiteUrl,
      workspaceName: workspace.name,
      industry: workspace.industry,
      icp: workspace.icp,
      voiceProfile: workspace.voiceProfile,
      ahrefsSnapshot: workspace.ahrefsSnapshot,
      ahrefsSnapshotAt: workspace.ahrefsSnapshotAt,
      plan: getEffectivePlan(workspace.subscription),
      credits,
    });
    dataSnapshot = snapshotText(fast);
  } catch (err) {
    console.warn("[chat] snapshot build failed:", err);
  }

  const system = buildSystemPrompt({
    workspaceName: workspace.name,
    websiteUrl: workspace.websiteUrl,
    industry: workspace.industry,
    icp: workspace.icp,
    dataSnapshot,
  });

  try {
    const { value: result, model: usedModel, tried } = await withTimeout(
      runWithFallback(
        preferred,
        (model) =>
          generateText({
            model: getModel(model),
            system,
            messages: coreMessages,
            tools,
            maxSteps: 4,
          }),
        { reason: "chat.generate" }
      ),
      GEN_TIMEOUT_MS
    );

    let text = result.text.trim();
    if (!text) {
      // The model finished after running tools but didn't write any prose.
      // Force a short follow-up summarizer call so the user always gets a reply.
      try {
        const followUp = await generateText({
          model: getModel(usedModel),
          system,
          prompt:
            "Summarize what you just did in 2-4 short sentences. Lead with the answer or finding, then mention the most important specific number or quote from the tool output. Do not call any more tools.",
        });
        text = followUp.text.trim();
      } catch {
        /* fall through to fallback below */
      }
    }
    if (!text) {
      text =
        "I ran the request but the model did not return any prose. Try asking again, simplifying the request, or check your provider quota.";
    }

    if (session.model !== usedModel) {
      try {
        session = await prisma.chatSession.update({
          where: { id: session.id },
          data: { model: usedModel },
        });
      } catch {
        /* non-fatal */
      }
    }

    const tokens = result.usage?.totalTokens ?? 0;
    const cost = MODEL_CREDIT_COST[usedModel] ?? 1;
    await chargeCredits({
      workspaceId: workspace.id,
      credits: cost,
      reason: "chat.generate",
      model: usedModel,
      tokens,
      meta: tried.length > 1 ? { tried } : undefined,
    });
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: text,
        tokens,
      },
    });

    return NextResponse.json(
      { text, sessionId: session.id, model: usedModel },
      {
        headers: {
          "X-Chat-Session-Id": session.id,
          "X-Chat-Model": usedModel,
        },
      }
    );
  } catch (err) {
    console.error("POST /api/chat failed:", err);
    const raw = err instanceof Error ? err.message : "Chat request failed.";
    const lower = raw.toLowerCase();
    let friendly = "The assistant is temporarily unavailable. Please try again in a moment.";
    if (lower.includes("chat_timeout")) {
      friendly = "That request took too long. Try a more specific question, or run the relevant scan/audit first so I can answer from the results.";
    } else if (lower.includes("credit balance") || lower.includes("low balance") || lower.includes("billing")) {
      friendly = "The assistant is temporarily unavailable (usage limit reached). Please try again later.";
    }
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

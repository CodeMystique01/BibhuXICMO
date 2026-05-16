import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Sparkles, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { auth } from "@/backend/auth";
import { prisma } from "@/backend/db";
import { getBalance, FREE_PLAN_MONTHLY_CREDITS } from "@/backend/credits";

const TOOL_COPY: Record<
  string,
  {
    name: string;
    description: string;
    how: string[];
    /** Where to send a signed-in user when they click "Open". */
    openHref: string;
    /** Optional preset prompt for the chat-based tools. */
    presetPrompt?: string;
    /** ~credits a single normal use will burn (rough estimate). */
    creditsPerUse: number;
  }
> = {
  "chat-with-pdf": {
    name: "Chat with PDF",
    description:
      "Upload a PDF and ask questions across the full document. Answers cite the pages they came from.",
    how: [
      "Drop a PDF (up to 50 pages for free).",
      "We extract and chunk the text with a token-aware splitter.",
      "Each question is answered by an LLM with the matching chunks as context.",
    ],
    openHref: "/chat",
    presetPrompt:
      "I want to chat with a PDF. Walk me through uploading it.",
    creditsPerUse: 4,
  },
  "chat-with-youtube": {
    name: "Chat with YouTube",
    description:
      "Paste any YouTube URL — we transcribe the audio and let you chat with the content.",
    how: [
      "Paste a YouTube link.",
      "We fetch the closed-caption track when available, otherwise transcribe with Whisper.",
      "Ask anything — the LLM cites the matching timestamps in its answers.",
    ],
    openHref: "/chat",
    presetPrompt:
      "I want to chat with a YouTube video. Here's the URL: ",
    creditsPerUse: 6,
  },
  "chat-with-x": {
    name: "Chat with X",
    description:
      "Analyze a single post, an entire thread, or a handle's recent activity.",
    how: [
      "Paste an X post URL or @handle.",
      "We pull the content, replies, and author bio via the X API.",
      "Ask about tone, topics, response quality, or get a summary.",
    ],
    openHref: "/chat",
    presetPrompt: "Analyze this X post / handle: ",
    creditsPerUse: 3,
  },
  "web-search": {
    name: "Web Research",
    description:
      "Evidence-based answers that cite their sources, not hallucinated summaries.",
    how: [
      "Ask any question.",
      "We run a multi-provider web search, fetch the top pages, and extract clean text.",
      "The LLM writes an answer grounded in those sources, each citation clickable.",
    ],
    openHref: "/chat",
    presetPrompt: "Research this for me with sources: ",
    creditsPerUse: 5,
  },
  "private-chat": {
    name: "Private Chat",
    description:
      "Multi-model chat workbench — OpenAI, Anthropic, and more in one place.",
    how: [
      "Pick your model (GPT-4o, Claude, DeepSeek, Mistral, more).",
      "Chat with built-in tools: web search, URL scrape, PDF read.",
      "History saved per account, export anytime.",
    ],
    openHref: "/chat",
    creditsPerUse: 1,
  },
};

export function generateStaticParams() {
  return Object.keys(TOOL_COPY).map((slug) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const t = TOOL_COPY[slug];
  if (!t) return { title: "Not found" };
  return { title: t.name, description: t.description };
}

export default async function ToolDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const tool = TOOL_COPY[slug];
  if (!tool) notFound();

  // Auth state — drives which CTA we render.
  const session = await auth();
  let credits: number | null = null;
  let plan: "FREE" | "MAX" = "FREE";
  if (session?.user?.id) {
    const ws = await prisma.workspace.findFirst({
      where: { ownerUserId: session.user.id },
      include: { subscription: true },
    });
    if (ws) {
      credits = await getBalance(ws.id);
      plan = (ws.subscription?.plan as "FREE" | "MAX") ?? "FREE";
    }
  }

  // Build the "open in workspace" URL — pass an optional preset prompt.
  const openHref = tool.presetPrompt
    ? `${tool.openHref}?prompt=${encodeURIComponent(tool.presetPrompt)}`
    : tool.openHref;

  // Estimate how many uses they have left at current balance.
  const usesLeft =
    credits !== null ? Math.floor(credits / tool.creditsPerUse) : null;

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <Link
        href="/tools"
        className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All tools
      </Link>

      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
        {tool.name}
      </h1>
      <p className="mt-3 text-muted-foreground">{tool.description}</p>

      {/* Logged-out CTA */}
      {!session?.user ? (
        <div className="mt-12 rounded-2xl border bg-card p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Sign up to use this tool</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Free accounts get{" "}
                <span className="font-medium text-foreground">
                  {FREE_PLAN_MONTHLY_CREDITS.toLocaleString()} credits
                </span>{" "}
                every month — about{" "}
                <span className="font-medium text-foreground">
                  {Math.floor(FREE_PLAN_MONTHLY_CREDITS / tool.creditsPerUse)}
                </span>{" "}
                runs of {tool.name}. No credit card required.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 sm:pl-14">
            <Button asChild size="lg">
              <Link href={`/register?next=${encodeURIComponent(`/tools/${slug}`)}`}>
                Sign up free
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/login?callbackUrl=${encodeURIComponent(`/tools/${slug}`)}`}>
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        /* Logged-in CTA — show usage + open the workspace */
        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">
                You&rsquo;re signed in — open this tool in your workspace
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Each run costs roughly{" "}
                <span className="font-medium text-foreground">
                  {tool.creditsPerUse} credits
                </span>
                . You have{" "}
                <span className="font-medium text-foreground">
                  {credits?.toLocaleString() ?? "?"} credits
                </span>
                {usesLeft !== null ? (
                  <>
                    {" "}— around{" "}
                    <span className="font-medium text-foreground">
                      {usesLeft}
                    </span>{" "}
                    runs left this month.
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 sm:pl-14">
            <Button asChild size="lg">
              <Link href={openHref}>Open in workspace</Link>
            </Button>
            {plan === "FREE" ? (
              <Button variant="outline" size="lg" asChild>
                <Link href="/billing">
                  <Zap className="h-4 w-4" />
                  Upgrade to Max
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <h2 className="mt-16 text-xl font-semibold">How it works</h2>
      <ol className="mt-4 space-y-3 text-sm">
        {tool.how.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

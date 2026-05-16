"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING_LINES: string[] = [
  "Hi, I'm your CMO. Paste any URL and I'll analyze it live — meta, PageSpeed, structure.",
  "Ask me to run an SEO or GEO audit, draft an X / LinkedIn / blog post, or scan Reddit and HN for relevant threads.",
  "Try: 'audit https://your-site.com', 'find Reddit threads about prompt engineering', or 'draft a LinkedIn post on observability for startups'.",
];

export function ChatDock({
  workspaceName,
  llmConfigured,
}: {
  workspaceName: string;
  llmConfigured: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);

    if (!llmConfigured) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "I can't think yet — no valid LLM API key is configured. Add **ANTHROPIC_API_KEY** (preferred — the CMO is Claude-first) or OPENAI_API_KEY to your environment, then redeploy or restart the dev server.",
        },
      ]);
      setBusy(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            source: "cmo",
            messages: next,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await safeJson(res);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: err?.error || `Request failed (${res.status}). Please try again.`,
            },
          ]);
          return;
        }

        const newSession = res.headers.get("x-chat-session-id") ?? undefined;
        if (newSession) setSessionId(newSession);

        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const data = (await res.json()) as { text?: string; error?: string };
          const apiError = data.error;
          if (apiError) {
            setMessages((m) => [
              ...m,
              { role: "assistant", content: apiError },
            ]);
            return;
          }
          const reply = (data.text ?? "").trim();
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: reply,
            },
          ]);
          return;
        }

        if (!res.body) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "Request returned no body. Please try again.",
            },
          ]);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistant = "";
        setMessages((m) => [...m, { role: "assistant", content: "" }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistant += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: assistant };
            return copy;
          });
        }
        if (!assistant.trim()) {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = {
              role: "assistant",
              content:
                "No text came back from the model (it may have stopped after tool calls, or the stream was empty). Try asking again, or check server logs / API quota.",
            };
            return copy;
          });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "That took too long (2+ minutes) and was cancelled. Try a shorter question or try again in a moment."
          : err instanceof Error
            ? err.message
            : "Network error talking to the agent.";
      setMessages((m) => [...m, { role: "assistant", content: message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-primary" aria-hidden />
          Talk to AI CMO
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        </CardTitle>
        <CardDescription className="truncate">
          Workspace: {workspaceName}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div
          ref={listRef}
          className="flex-1 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm"
          style={{ minHeight: 200, maxHeight: 380 }}
        >
          {messages.length === 0 ? (
            <div className="space-y-2 text-xs text-muted-foreground">
              {GREETING_LINES.map((line) => (
                <p key={line} className="leading-snug">
                  {line}
                </p>
              ))}
              {!llmConfigured ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                  Add <code className="font-mono">ANTHROPIC_API_KEY</code> (preferred) or
                  {" "}<code className="font-mono">OPENAI_API_KEY</code> to enable real
                  responses. The AI CMO routes Claude-first.
                </p>
              ) : null}
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} msg={m} />)
          )}
          {busy ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
                style={{ animationDelay: "240ms" }}
              />
            </div>
          ) : null}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            aria-label="Message"
            disabled={busy}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={busy || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-xs leading-snug text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex">
      <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border bg-background px-3 py-1.5 text-xs leading-snug text-foreground">
        {msg.content || "…"}
      </div>
    </div>
  );
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

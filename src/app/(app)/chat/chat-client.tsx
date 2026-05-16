"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Send, Plus, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/shared/utils";

type Msg = { role: "user" | "assistant"; content: string };

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
] as const;

export function Chat({
  sessions,
  activeSessionId,
  activeModel,
  initialMessages,
  initialInput = "",
}: {
  sessions: Array<{ id: string; title: string; model: string; updatedAt: string }>;
  activeSessionId?: string;
  activeModel: string;
  initialMessages: Msg[];
  initialInput?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState(initialInput);
  const [model, setModel] = useState(activeModel);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(activeSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Per-session draft + scroll persistence — keyed on session id (or "new"
  // for an unstarted chat). Restored on mount, written on input change.
  const draftKey = `chat:draft:${sessionId ?? "new"}`;
  const scrollKey = `chat:scroll:${sessionId ?? "new"}`;

  // Restore draft + scroll once on mount per sessionId change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft && !initialInput) setInput(savedDraft);
    const savedScroll = window.sessionStorage.getItem(scrollKey);
    if (savedScroll && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: Number(savedScroll) });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Persist input draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (input) window.localStorage.setItem(draftKey, input);
    else window.localStorage.removeItem(draftKey);
  }, [input, draftKey]);

  // Persist scroll position.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    function onScroll() {
      if (typeof window !== "undefined" && node) {
        window.sessionStorage.setItem(scrollKey, String(node.scrollTop));
      }
    }
    node.addEventListener("scroll", onScroll);
    return () => node.removeEventListener("scroll", onScroll);
  }, [scrollKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftKey);
    }
    setStreaming(true);

    // Optimistic assistant placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          model,
          messages: next,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Chat failed (${res.status})`);
      }

      const newSid = res.headers.get("X-Chat-Session-Id");
      if (newSid && !sessionId) setSessionId(newSid);

      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { text?: string; error?: string };
        if (data.error) throw new Error(data.error);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: data.text ?? "",
          };
          return copy;
        });
        router.refresh();
        return;
      }

      if (!res.body) {
        throw new Error("Chat returned no body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      router.refresh();
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content:
            `_Error: ${e instanceof Error ? e.message : "unknown"}_`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-primary" />
            Chats
          </div>
          <Link href="/chat">
            <Button size="icon" variant="ghost" title="New chat">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No chats yet.</p>
          ) : (
            sessions.map((s) => (
              <Link
                key={s.id}
                href={`/chat?session=${s.id}`}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  s.id === sessionId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <div className="truncate font-medium">{s.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{s.model.replace("gpt-4o-mini", "4o-mini").replace("gpt-4o", "4o")}</span>
                  <span>·</span>
                  <span>{format(new Date(s.updatedAt), "MMM d")}</span>
                </div>
              </Link>
            ))
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              disabled={streaming}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {streaming && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                thinking
              </Badge>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageSquare className="mb-4 h-10 w-10 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold">Start a new conversation</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Pick a model and ask anything. Your workspace&apos;s brand voice is
                available as context when you need it.
              </p>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m, i) => (
              <div key={i} className="flex gap-4">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.role === "user" ? "You" : "AI"}
                </div>
                <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-7">
                  {m.content || (
                    <span className="text-muted-foreground">…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={send}
          className="border-t bg-background/80 p-4 backdrop-blur"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(e);
                }
              }}
              placeholder="Message the model…"
              rows={1}
              className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={streaming}
            />
            <Button type="submit" disabled={!input.trim() || streaming} size="lg">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-[10px] text-muted-foreground">
            Shift + Enter for newline · each message uses credits based on the selected model
          </p>
        </form>
      </div>
    </div>
  );
}

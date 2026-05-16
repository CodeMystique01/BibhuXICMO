import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Chat } from "./chat-client";

export const metadata = { title: "Private Chat" };

export default async function ChatPage(props: {
  searchParams: Promise<{ session?: string; prompt?: string }>;
}) {
  const { workspace, user } = await requireWorkspace({ skipOnboardingCheck: true });
  const { session: sessionId, prompt } = await props.searchParams;

  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, model: true, updatedAt: true },
  });

  let initialMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let activeModel = "gpt-4o-mini";
  if (sessionId) {
    const s = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (s) {
      activeModel = normalizeLegacyModel(s.model);
      initialMessages = s.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));
    }
  }

  return (
    <Chat
      sessions={sessions.map((s) => ({
        id: s.id,
        title: s.title ?? "Untitled",
        model: normalizeLegacyModel(s.model),
        updatedAt: s.updatedAt.toISOString(),
      }))}
      activeSessionId={sessionId}
      activeModel={activeModel}
      initialMessages={initialMessages}
      initialInput={prompt ?? ""}
    />
  );
}

/**
 * Anthropic retired the old `claude-3-5-*` model IDs in late 2025. Old chat
 * sessions still have those names persisted; map them to the current Claude
 * 4.x lineup so the model dropdown highlights the right entry.
 */
function normalizeLegacyModel(model: string): string {
  if (model === "claude-3-5-sonnet") return "claude-sonnet-4-6";
  if (model === "claude-3-5-haiku") return "claude-haiku-4-5";
  return model;
}

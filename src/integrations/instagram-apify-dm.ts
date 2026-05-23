/**
 * Apify-backed Instagram DM automation.
 *
 * WARNING: This is the ToS-risky path. The DM-automation actor logs into
 * Instagram using the workspace's stored session cookies (or sessionId)
 * and behaves as a real user — IG can detect, throttle, or ban accounts
 * that abuse this. We expose it behind the IG cookies modal with an
 * explicit risk acknowledgement, and the agent enforces per-workspace
 * rate limits separately (see runIGOutreach).
 *
 * Config:
 *   APIFY_TOKEN (or APIFY_IG_TOKEN)  — required
 *   APIFY_IG_DM_ACTOR_ID             — default "quickads~instagram-dm-automation"
 *
 * Cookies are persisted in Integration.meta.dmCookies (encrypted at the
 * application layer). This module reads the already-decrypted value.
 */
import { env } from "@/shared/env";
import { ApifyIGNotConfiguredError, ApifyIGError } from "./instagram-apify";

const SYNC_TIMEOUT_MS = 90_000;

export class IGCookiesExpiredError extends Error {
  constructor(msg = "Instagram session cookies expired or rejected") {
    super(msg);
    this.name = "IGCookiesExpiredError";
  }
}

function apifyToken(): string {
  const token = env.APIFY_IG_TOKEN || env.APIFY_TOKEN;
  if (!token) throw new ApifyIGNotConfiguredError();
  return token;
}

export type ApifySendDMInput = {
  /** Decrypted IG session cookie payload (sessionId or full cookie jar). */
  cookies: unknown;
  /** Recipient @handle (no @ prefix needed). */
  recipient: string;
  /** Message body — keep under 1000 chars; IG silently truncates. */
  message: string;
  /** Reply to a specific thread/message id (optional, actor-dependent). */
  replyToThreadId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ApifySendDMResult = {
  ok: true;
  threadId?: string;
  messageId?: string;
};

/**
 * Send a single DM via the configured Apify DM-automation actor.
 * Throws IGCookiesExpiredError when the actor reports an auth failure.
 */
export async function apifySendDM(
  input: ApifySendDMInput
): Promise<ApifySendDMResult> {
  const actor = env.APIFY_IG_DM_ACTOR_ID;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken())}`;

  const payload = {
    cookies: input.cookies,
    messages: [
      {
        recipient: input.recipient.replace(/^@/, ""),
        message: input.message,
        ...(input.replyToThreadId ? { threadId: input.replyToThreadId } : {}),
      },
    ],
  };

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  input.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(
    () => ctrl.abort(),
    input.timeoutMs ?? SYNC_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (
      res.status === 401 ||
      res.status === 403 ||
      /login|cookie|session|auth/i.test(detail)
    ) {
      throw new IGCookiesExpiredError(
        `${res.status}: ${detail.slice(0, 200)}`
      );
    }
    throw new ApifyIGError(
      `Apify DM actor returned ${res.status}: ${detail.slice(0, 200)}`,
      res.status
    );
  }

  const items = (await res.json().catch(() => [])) as Array<{
    threadId?: string;
    messageId?: string;
    error?: string;
    needsLogin?: boolean;
  }>;
  const first = Array.isArray(items) ? items[0] : undefined;
  if (first?.needsLogin || /login|cookie|session/i.test(first?.error ?? "")) {
    throw new IGCookiesExpiredError(first?.error);
  }

  return {
    ok: true,
    threadId: first?.threadId,
    messageId: first?.messageId,
  };
}

export type IGInboxMessage = {
  threadId: string;
  messageId: string;
  fromHandle: string;
  text: string;
  timestamp: string;
  isFromUs: boolean;
};

/**
 * Poll the connected account's DM inbox via Apify. Some actors require
 * an explicit thread list; we let the actor decide its own batching.
 * Returns recent messages (caller dedupes by messageId).
 */
export async function apifyPollInbox(
  cookies: unknown,
  opts: { limit?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<IGInboxMessage[]> {
  const actor = env.APIFY_IG_DM_ACTOR_ID;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken())}`;

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cookies,
        mode: "inbox",
        limit: Math.min(opts.limit ?? 30, 100),
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new IGCookiesExpiredError(`${res.status}: ${detail.slice(0, 200)}`);
    }
    throw new ApifyIGError(
      `Apify inbox poll returned ${res.status}: ${detail.slice(0, 200)}`,
      res.status
    );
  }

  const items = await res.json().catch(() => []);
  if (!Array.isArray(items)) return [];

  return items
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      const threadId = String(o.threadId ?? o.thread_id ?? "");
      const messageId = String(o.messageId ?? o.message_id ?? o.id ?? "");
      const text = String(o.text ?? o.message ?? "");
      const fromHandle = String(
        o.fromHandle ?? o.username ?? o.sender ?? "unknown"
      );
      const timestamp = String(o.timestamp ?? o.createdAt ?? new Date().toISOString());
      const isFromUs = o.isFromUs === true || o.isMe === true;
      if (!threadId || !messageId || !text) return null;
      return { threadId, messageId, fromHandle, text, timestamp, isFromUs };
    })
    .filter((m): m is IGInboxMessage => m !== null);
}

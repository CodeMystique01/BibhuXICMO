import { cache } from "react";
import { prisma } from "./db";

export const FREE_PLAN_MONTHLY_CREDITS = 2005; // 5 premium + 2000 cheap
export const MAX_PLAN_MONTHLY_CREDITS = 2000;

/**
 * Credit cost per model call — denominated in "credits".
 * 1 credit ≈ 1 premium-model message or ~10 cheap-model messages.
 */
export const MODEL_CREDIT_COST: Record<string, number> = {
  "gpt-4o": 1,
  "gpt-4o-mini": 0.1,
  "claude-sonnet-4-6": 1,
  "claude-haiku-4-5": 0.1,
  "claude-opus-4-7": 2,
  "claude-3-5-sonnet": 1, // legacy alias
  "claude-3-5-haiku": 0.1, // legacy alias
  "gemini-1.5-flash": 0.1,
  "gemini-1.5-pro": 0.5,
  "perplexity-sonar": 0.5,
  "perplexity-sonar-pro": 1,
  "openrouter:gpt-4o-mini": 0.1,
  "openrouter:claude-sonnet-4-6": 1,
  "openrouter:claude-3-5-sonnet": 1, // legacy alias
  "deepseek-chat": 0.1,
  "mistral-large": 0.5,
};

/**
 * Per-request cached so the layout and page can each ask for the balance
 * without paying a duplicate DB round-trip on every navigation.
 */
export const getBalance = cache(async function getBalance(
  workspaceId: string
): Promise<number> {
  const latest = await prisma.creditLedger.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return latest?.balance ?? 0;
});

export async function grantCredits(
  workspaceId: string,
  amount: number,
  reason: string
): Promise<number> {
  const current = await getBalance(workspaceId);
  const balance = current + amount;
  await prisma.creditLedger.create({
    data: { workspaceId, delta: amount, balance, reason },
  });
  return balance;
}

export async function chargeCredits({
  workspaceId,
  credits,
  reason,
  model,
  tokens,
  meta,
}: {
  workspaceId: string;
  credits: number;
  reason: string;
  model?: string;
  tokens?: number;
  meta?: Record<string, unknown>;
}): Promise<number> {
  if (credits <= 0) return getBalance(workspaceId);
  // Ledger uses Int — MODEL_CREDIT_COST uses fractional “cheap” units; always bill whole credits.
  const debit = Math.max(1, Math.ceil(credits));
  const current = await getBalance(workspaceId);
  const balance = current - debit;
  await prisma.creditLedger.create({
    data: {
      workspaceId,
      delta: -debit,
      balance,
      reason,
      model,
      tokens,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
    },
  });
  return balance;
}

export async function assertHasCredits(workspaceId: string, required = 1) {
  const bal = await getBalance(workspaceId);
  if (bal < required) {
    throw new CreditError(
      `Not enough credits. Required: ${required}, balance: ${bal}.`
    );
  }
}

export async function seedFreeCredits(workspaceId: string) {
  await grantCredits(workspaceId, FREE_PLAN_MONTHLY_CREDITS, "free.signup.grant");
}

export class CreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditError";
  }
}

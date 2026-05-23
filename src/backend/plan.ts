/**
 * Effective plan resolution + dev unlock helpers.
 *
 * Three layers determine whether a workspace gets the Max experience:
 *
 *   1. `XICMO_UNLOCK_ALL=1` — explicit dev override. Everyone is Max,
 *      every feature gated on plan is treated as unlocked, credit
 *      checks become no-ops.
 *   2. `STRIPE_SECRET_KEY` absent — billing isn't even configured on
 *      this deployment, so it would be cruel to keep the workspace on
 *      a paywalled plan. Default everyone to Max.
 *   3. Real subscription row from the DB.
 *
 * Importing this everywhere avoids scattering `process.env` checks
 * across the codebase.
 */
import { env } from "@/shared/env";

export type Plan = "FREE" | "MAX";

export function isBillingEnabled(): boolean {
  // If neither dev unlock nor missing Stripe — billing is on.
  if (env.XICMO_UNLOCK_ALL === "1") return false;
  if (!env.STRIPE_SECRET_KEY) return false;
  return true;
}

/**
 * Returns the effective plan for the workspace. Use this instead of
 * `workspace.subscription?.plan ?? "FREE"`.
 */
export function getEffectivePlan(
  subscription: { plan?: string | null } | null | undefined
): Plan {
  if (!isBillingEnabled()) return "MAX";
  const p = subscription?.plan;
  return p === "MAX" ? "MAX" : "FREE";
}

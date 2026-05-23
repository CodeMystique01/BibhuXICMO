import { format } from "date-fns";
import { Check, Zap } from "lucide-react";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { getBalance } from "@/backend/credits";
import { stripeCheckoutReady, stripeWebhookReady } from "@/backend/stripe";
import { BillingActions } from "./actions-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { getEffectivePlan } from "@/backend/plan";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const { workspace } = await requireWorkspace();
  const [balance, recentLedger] = await Promise.all([
    getBalance(workspace.id),
    prisma.creditLedger.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const plan = getEffectivePlan(workspace.subscription);
  const subStatus = workspace.subscription?.status ?? "ACTIVE";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and see how your credits are being used.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {plan === "MAX" ? "Max plan" : "Free plan"}
              </CardTitle>
              <CardDescription>
                Status: <Badge variant="outline">{subStatus.toLowerCase()}</Badge>
                {workspace.subscription?.currentPeriodEnd && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    Renews {format(workspace.subscription.currentPeriodEnd, "MMM d, yyyy")}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-2xl font-bold">
                <Zap className="h-5 w-5 text-primary" />
                {balance.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">credits available</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <BillingActions
            plan={plan}
            stripeCheckoutReady={stripeCheckoutReady()}
            stripeWebhookReady={stripeWebhookReady()}
            hasCustomer={!!workspace.subscription?.stripeCustomerId}
          />
        </CardContent>
      </Card>

      {plan === "FREE" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade to Max — $99/mo</CardTitle>
            <CardDescription>
              Unlock the full AI marketing team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 md:grid-cols-2">
              {[
                "2,000 premium credits / month",
                "All 10+ agents unlocked",
                "Daily scheduled runs",
                "Reddit + X + LinkedIn publishing",
                "GSC + GA4 integrations",
                "GEO score tracking",
                "Coding Agent (GitHub PRs)",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credit activity</CardTitle>
          <CardDescription>
            Every grant and every LLM call shows up here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLedger.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ul className="divide-y">
              {recentLedger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{entry.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(entry.createdAt, "MMM d, yyyy · HH:mm")}
                      {entry.model && ` · ${entry.model}`}
                      {entry.tokens ? ` · ${entry.tokens} tokens` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={
                        entry.delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      bal {entry.balance}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

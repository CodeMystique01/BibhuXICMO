"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { requestPasswordResetAction, type ForgotResult } from "./actions";

export function ForgotForm() {
  const [state, action] = useActionState<ForgotResult | null, FormData>(
    requestPasswordResetAction,
    null
  );
  const [isPending, startTransition] = useTransition();

  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

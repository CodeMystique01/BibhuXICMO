"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { ProgressSteps } from "@/frontend/components/ui/progress-steps";
import { PasswordStrength } from "@/frontend/components/ui/password-strength";
import { registerAction, type RegisterResult } from "./actions";

const SIGNUP_STEPS = [
  "Creating your account",
  "Securing your password",
  "Spinning up your workspace",
  "Preparing onboarding",
];

export function RegisterForm() {
  const router = useRouter();
  const [state, action] = useActionState<RegisterResult | null, FormData>(
    registerAction,
    null
  );
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (state?.ok) {
      toast.success("Welcome!", { description: "Taking you to onboarding…" });
      router.push("/onboarding");
    }
  }, [state, router]);

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="space-y-4"
    >
      <fieldset
        disabled={isPending}
        className="space-y-4 transition-opacity duration-300 disabled:opacity-60"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Ada Lovelace" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={
              state && !state.ok && state.field === "email" ? true : undefined
            }
          />
          {state && !state.ok && state.field === "email" ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <p className="text-amber-700 dark:text-amber-300">{state.error}</p>
              {/^An account with that email/.test(state.error) ? (
                <Link
                  href={`/login?email=${encodeURIComponent(email)}`}
                  className="mt-1 inline-block font-medium text-primary hover:underline"
                >
                  → Sign in instead
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            minLength={8}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} />
        </div>
      </fieldset>

      {state && !state.ok && state.field !== "email" && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full transition-transform active:scale-[0.99]"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating account…
          </>
        ) : (
          "Create account"
        )}
      </Button>

      {isPending ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <ProgressSteps steps={SIGNUP_STEPS} intervalMs={1400} />
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to our{" "}
          <a href="/terms" className="underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      )}
    </form>
  );
}

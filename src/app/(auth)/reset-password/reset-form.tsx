"use client";

import { useActionState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { resetPasswordAction, type ResetPasswordResult } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action] = useActionState<ResetPasswordResult | null, FormData>(
    resetPasswordAction,
    null
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Password updated", { description: "You can sign in with your new password." });
      router.push("/login");
    }
  }, [state, router]);

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="space-y-4"
    >
      <input type="hidden" name="token" defaultValue={token} />

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Update password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";

export function LoginForm({
  callbackUrl,
  initialEmail = "",
}: {
  callbackUrl?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") || "");
        const password = String(fd.get("password") || "");

        startTransition(async () => {
          const res = await signIn("credentials", {
            email,
            password,
            redirect: false,
          });
          if (res?.error) {
            setError("Invalid email or password");
            return;
          }
          toast.success("Signed in");
          router.push(callbackUrl || "/dashboard");
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <fieldset
        disabled={isPending}
        className="space-y-4 transition-opacity duration-300 disabled:opacity-60"
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
            defaultValue={initialEmail}
            autoFocus={!initialEmail}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus={!!initialEmail}
          />
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        size="lg"
        className="w-full transition-transform active:scale-[0.99]"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}

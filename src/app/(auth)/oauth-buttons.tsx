"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/frontend/components/ui/button";
import { Github } from "lucide-react";

export function OAuthButtons({
  action,
  callbackUrl,
  showGoogle,
  showGithub,
}: {
  action: "login" | "register";
  callbackUrl?: string;
  showGoogle: boolean;
  showGithub: boolean;
}) {
  const verb = action === "login" ? "Continue" : "Sign up";
  const target = callbackUrl || "/dashboard";

  if (!showGoogle && !showGithub) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {showGoogle ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => signIn("google", { callbackUrl: target })}
        >
          <GoogleIcon className="h-4 w-4" />
          {verb} with Google
        </Button>
      ) : null}
      {showGithub ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => signIn("github", { callbackUrl: target })}
        >
          <Github className="h-4 w-4" />
          {verb} with GitHub
        </Button>
      ) : null}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.72h5.25c-.23 1.25-1.64 3.67-5.25 3.67-3.16 0-5.73-2.62-5.73-5.85S8.84 5.89 12 5.89c1.8 0 3 .77 3.69 1.43l2.52-2.43C16.55 3.41 14.5 2.5 12 2.5 6.94 2.5 2.9 6.54 2.9 11.6s4.04 9.1 9.1 9.1c5.25 0 8.72-3.69 8.72-8.88 0-.6-.06-1.06-.14-1.52H12z"
      />
    </svg>
  );
}

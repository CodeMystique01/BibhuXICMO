import Link from "next/link";
import { auth } from "@/backend/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./form";
import { OAuthButtons } from "../oauth-buttons";
import { Separator } from "@/frontend/components/ui/separator";
import {
  oauthGithubEnabled,
  oauthGoogleEnabled,
} from "@/shared/oauth-provider-flags";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; email?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, email } = await searchParams;

  if (session?.user) redirect(callbackUrl || "/dashboard");

  const showGoogle = oauthGoogleEnabled();
  const showGithub = oauthGithubEnabled();
  const showOAuth = showGoogle || showGithub;

  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to your Xicmo workspace.
        </p>
      </div>

      <OAuthButtons
        action="login"
        callbackUrl={callbackUrl}
        showGoogle={showGoogle}
        showGithub={showGithub}
      />

      {showOAuth ? (
        <div className="my-6 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">OR</span>
          <Separator className="flex-1" />
        </div>
      ) : null}

      <LoginForm callbackUrl={callbackUrl} initialEmail={email} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

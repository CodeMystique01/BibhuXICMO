import Link from "next/link";
import { auth } from "@/backend/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "./form";
import { OAuthButtons } from "../oauth-buttons";
import { Separator } from "@/frontend/components/ui/separator";
import {
  oauthGithubEnabled,
  oauthGoogleEnabled,
} from "@/shared/oauth-provider-flags";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const showGoogle = oauthGoogleEnabled();
  const showGithub = oauthGithubEnabled();
  const showOAuth = showGoogle || showGithub;

  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start free. No credit card required.
        </p>
      </div>

      <OAuthButtons
        action="register"
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

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Set new password" };

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;

  if (!token || typeof token !== "string" || token.length < 16) {
    return (
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This password reset link is missing or incomplete. Request a new link from the sign-in page.
        </p>
        <Link
          href="/forgot"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Request reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a new password for your account.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}

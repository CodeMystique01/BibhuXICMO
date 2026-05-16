import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email you a reset link if an account exists for that address.
        </p>
      </div>

      <ForgotForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

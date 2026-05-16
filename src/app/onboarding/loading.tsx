import { Loader2 } from "lucide-react";
import { Logo } from "@/frontend/components/marketing/logo";

export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex h-16 items-center">
        <Logo />
      </header>
      <main className="container flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="mb-10 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              Step 1 of 2
            </p>
            <div className="mx-auto mt-3 h-9 w-2/3 animate-pulse rounded-md bg-muted" />
            <div className="mx-auto mt-3 h-4 w-3/4 animate-pulse rounded-md bg-muted/70" />
          </div>
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
              <div className="h-10 animate-pulse rounded-md bg-muted/60" />
            </div>
            <div className="mt-6 flex h-11 items-center justify-center rounded-md bg-primary/40">
              <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

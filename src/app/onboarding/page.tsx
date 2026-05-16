import { redirect } from "next/navigation";
import { requireWorkspace } from "@/backend/workspace";
import { Logo } from "@/frontend/components/marketing/logo";
import { OnboardingForm } from "./form";

export const metadata = { title: "Welcome — let's analyze your site" };

export default async function OnboardingPage() {
  const { user, workspace } = await requireWorkspace({ skipOnboardingCheck: true });

  if (workspace.websiteUrl) redirect("/agent/cmo");

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
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Welcome, {user.name?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="mt-3 text-muted-foreground">
              Paste your website URL. We&apos;ll crawl it, infer your positioning, ICP, and
              voice, and seed your first action items.
            </p>
          </div>

          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}

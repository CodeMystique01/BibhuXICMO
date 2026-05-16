import { CONTACT, mailto } from "@/shared/site";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Privacy Policy</h1>
      <p className="mt-3 text-muted-foreground">Last updated: May 3, 2026</p>

      <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7">
        <h2 className="mt-10 text-2xl font-semibold">Data we collect</h2>
        <p>
          We collect account information (name, email, hashed password or OAuth identifier),
          workspace data (website URL, strategy document, drafts), and usage telemetry
          (agent runs, credit consumption, error logs). We never sell your data.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Third parties</h2>
        <p>
          We use Stripe for payments, Resend for transactional email, and the LLM providers
          you have selected (OpenAI, Anthropic, Perplexity). External integrations you
          connect (Google Search Console, GA4, Reddit, X, LinkedIn, GitHub) receive only
          the scopes you grant.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Your rights</h2>
        <p>
          You can export or delete your workspace data at any time from the Settings page.
          Contact{" "}
          <a href={mailto(CONTACT.privacy)} className="text-primary hover:underline">
            {CONTACT.privacy}
          </a>{" "}
          with any questions.
        </p>
      </div>
    </article>
  );
}

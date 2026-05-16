export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Terms of Service</h1>
      <p className="mt-3 text-muted-foreground">Last updated: May 3, 2026</p>

      <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7">
        <h2 className="mt-10 text-2xl font-semibold">Use of the service</h2>
        <p>
          You agree to use Xicmo in compliance with applicable laws and the terms of any
          third-party platform you connect (e.g. Reddit, X, LinkedIn).
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Subscriptions</h2>
        <p>
          Max plan subscriptions renew monthly. You can cancel from the billing page at any
          time; access continues until the end of the current period.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Liability</h2>
        <p>
          Xicmo is provided as-is. We make no guarantees about specific traffic, ranking,
          or revenue outcomes.
        </p>
      </div>
    </article>
  );
}

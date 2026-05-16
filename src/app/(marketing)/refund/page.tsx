import { CONTACT, mailto } from "@/shared/site";

export const metadata = { title: "Refund Policy" };

export default function RefundPage() {
  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Refund Policy</h1>
      <p className="mt-3 text-muted-foreground">Last updated: May 3, 2026</p>

      <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7">
        <p>
          If you are not satisfied with Xicmo within the first 7 days of your Max-plan
          subscription, email{" "}
          <a href={mailto(CONTACT.billing)} className="text-primary hover:underline">
            {CONTACT.billing}
          </a>{" "}
          and we will issue a full refund, no questions asked.
        </p>
        <p>
          After 7 days, you can still cancel at any time from the billing page. Cancelling
          stops future charges but does not refund the current period.
        </p>
      </div>
    </article>
  );
}

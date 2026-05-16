import { CONTACT, mailto } from "@/shared/site";

export const metadata = { title: "Careers" };

export default function CareersPage() {
  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Careers</h1>
      <p className="mt-3 text-muted-foreground">
        We are a small, remote-first team building the AI marketing platform we always
        wanted. If you love shipping fast and caring about craft, we want to hear from you.
      </p>

      <div className="mt-10 rounded-2xl border bg-card p-8">
        <h2 className="text-lg font-semibold">Open roles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We do not have any open roles right now. Send a note to{" "}
          <a href={mailto(CONTACT.jobs)} className="text-primary hover:underline">
            {CONTACT.jobs}
          </a>{" "}
          if you think you&apos;d be a great fit anyway.
        </p>
      </div>
    </section>
  );
}

import { format } from "date-fns";
import { getChangelog, renderMarkdown } from "@/backend/content";

export const metadata = { title: "Changelog" };

export default function ChangelogPage() {
  const entries = getChangelog();

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <div className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Changelog
        </h1>
        <p className="mt-3 text-muted-foreground">
          Every change we ship, in one place.
        </p>
      </div>

      <div className="space-y-12">
        {entries.map((entry) => (
          <article key={entry.slug} className="relative border-l-2 border-border pl-6">
            <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
            <time className="text-xs text-muted-foreground">
              {format(new Date(entry.date), "MMMM d, yyyy")}
            </time>
            <h2 className="mt-1 text-xl font-semibold">{entry.title}</h2>
            <div
              className="prose prose-sm prose-neutral dark:prose-invert mt-4 max-w-none [&_h1]:hidden [&_h2]:text-base [&_h2]:mt-4 [&_ul]:mt-2"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

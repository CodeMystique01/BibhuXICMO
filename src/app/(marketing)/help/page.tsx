import { getHelpArticles } from "@/backend/content";
import { ClientSearchList } from "@/frontend/components/marketing/client-search-list";

export const metadata = { title: "Help Center" };

export default function HelpIndexPage() {
  const articles = getHelpArticles();

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Help Center
        </h1>
        <p className="mt-3 text-muted-foreground">
          Everything you need to know to get the most out of Xicmo.
        </p>
      </div>

      <ClientSearchList
        entries={articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          description: a.description,
          href: `/help/${a.slug}`,
        }))}
        placeholder="Search help articles…"
        emptyText="No articles match that search."
      />
    </section>
  );
}

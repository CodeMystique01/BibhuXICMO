import { getBlogPosts } from "@/backend/content";
import { ClientSearchList } from "@/frontend/components/marketing/client-search-list";

export const metadata = { title: "Blog" };

export default function BlogIndexPage() {
  const posts = getBlogPosts();

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Blog</h1>
        <p className="mt-3 text-muted-foreground">
          Writing about AI-native marketing, GEO, SEO, and building with Xicmo.
        </p>
      </div>

      <ClientSearchList
        entries={posts.map((p) => ({
          slug: p.slug,
          title: p.title,
          description: p.description,
          date: p.date,
          href: `/blog/${p.slug}`,
        }))}
        showDates
        placeholder="Search posts…"
        emptyText="No posts match that search."
      />
    </section>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getHelpArticles, getEntry, renderMarkdown } from "@/backend/content";

export async function generateStaticParams() {
  return getHelpArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const article = getEntry("help", slug);
  if (!article) return { title: "Not found" };
  return { title: article.title, description: article.description };
}

export default async function HelpArticlePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const article = getEntry("help", slug);
  if (!article) notFound();

  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <Link
        href="/help"
        className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Help Center
      </Link>

      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
        {article.title}
      </h1>

      <div
        className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7 [&_h1]:mt-0 [&_h2]:mt-10 [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:text-xl [&_p]:mb-4 [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
      />
    </article>
  );
}

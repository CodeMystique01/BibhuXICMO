import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getBlogPosts, getEntry, renderMarkdown } from "@/backend/content";

export async function generateStaticParams() {
  return getBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const post = getEntry("blog", slug);
  if (!post) return { title: "Not found" };
  return { title: post.title, description: post.description };
}

export default async function BlogPostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const post = getEntry("blog", slug);
  if (!post) notFound();

  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All posts
      </Link>

      <time className="text-xs text-muted-foreground">
        {format(new Date(post.date), "MMMM d, yyyy")}
      </time>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
        {post.title}
      </h1>
      {post.author && (
        <p className="mt-4 text-sm text-muted-foreground">By {post.author}</p>
      )}

      <div
        className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7 [&_h1]:mt-0 [&_h2]:mt-10 [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:text-xl [&_p]:mb-4 [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
      />
    </article>
  );
}

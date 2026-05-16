import Link from "next/link";
import { FileText, Youtube, Hash, Globe, MessageSquare, Gauge } from "lucide-react";

export const metadata = { title: "Free Tools" };

const TOOLS = [
  {
    slug: "site-audit",
    name: "Free Site Audit",
    description:
      "Live SEO score + Lighthouse + on-page signals for any URL. No sign-up.",
    icon: Gauge,
    featured: true,
  },
  {
    slug: "chat-with-pdf",
    name: "Chat with PDF",
    description: "Upload a PDF and ask questions across the full document.",
    icon: FileText,
  },
  {
    slug: "chat-with-youtube",
    name: "Chat with YouTube",
    description: "Paste a YouTube URL, we transcribe and let you chat with it.",
    icon: Youtube,
  },
  {
    slug: "chat-with-x",
    name: "Chat with X",
    description: "Analyze a post, thread, or a handle's recent activity.",
    icon: Hash,
  },
  {
    slug: "web-search",
    name: "Web Research",
    description: "Evidence-based answers that cite their sources.",
    icon: Globe,
  },
  {
    slug: "private-chat",
    name: "Private Chat",
    description: "Multi-model chat workbench — OpenAI, Anthropic, and more in one place.",
    icon: MessageSquare,
  },
];

export default function ToolsIndexPage() {
  return (
    <section className="container max-w-5xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Free Tools</h1>
      <p className="mt-3 text-muted-foreground">
        Small, focused utilities powered by the same engine that runs the full Xicmo workspace.
        No sign-up required for light usage.
      </p>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.slug}
              href={`/tools/${t.slug}`}
              className={
                "group rounded-2xl border bg-card p-6 transition-all hover:shadow-sm " +
                ("featured" in t && t.featured
                  ? "border-primary/40 bg-primary/5 hover:border-primary"
                  : "hover:border-primary/40")
              }
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold group-hover:text-primary">
                {t.name}
                {"featured" in t && t.featured ? (
                  <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 align-middle text-[10px] uppercase tracking-wider text-primary">
                    New
                  </span>
                ) : null}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

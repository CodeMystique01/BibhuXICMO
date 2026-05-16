import fs from "fs";
import path from "path";

export type ContentEntry = {
  slug: string;
  title: string;
  date: string;
  description?: string;
  author?: string;
  body: string;
};

const HEADING_CLASS: Record<number, string> = {
  1: "mt-8 text-3xl font-semibold tracking-tight",
  2: "mt-8 text-2xl font-semibold tracking-tight",
  3: "mt-6 text-xl font-semibold",
  4: "mt-6 text-lg font-semibold",
  5: "mt-4 text-base font-semibold",
  6: "mt-4 text-sm font-semibold",
};

/**
 * Minimal Markdown → HTML (headings, bold, italic, links, code, lists).
 * Heading classes are static strings so Tailwind JIT can see them.
 */
export class MarkdownRenderer {
  render(md: string): string {
    const lines = md.split("\n");
    const out: string[] = [];
    let inList = false;
    let inCode = false;
    let inPara: string[] = [];

    const flushPara = () => {
      if (inPara.length) {
        out.push(`<p>${MarkdownRenderer.inline(inPara.join(" "))}</p>`);
        inPara = [];
      }
    };

    for (const line of lines) {
      if (line.startsWith("```")) {
        flushPara();
        if (inCode) {
          out.push("</code></pre>");
          inCode = false;
        } else {
          out.push('<pre class="rounded-lg border bg-muted p-4 overflow-x-auto"><code>');
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        out.push(
          line.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))
        );
        continue;
      }
      if (line.match(/^#{1,6}\s/)) {
        flushPara();
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        const level = Math.min(line.match(/^#+/)![0].length, 6);
        const text = line.replace(/^#+\s*/, "");
        const cls = HEADING_CLASS[level] ?? HEADING_CLASS[6];
        out.push(`<h${level} class="${cls}">${MarkdownRenderer.inline(text)}</h${level}>`);
        continue;
      }
      if (line.match(/^[-*]\s/)) {
        flushPara();
        if (!inList) {
          out.push('<ul class="my-4 list-disc pl-6 space-y-1">');
          inList = true;
        }
        out.push(`<li>${MarkdownRenderer.inline(line.replace(/^[-*]\s+/, ""))}</li>`);
        continue;
      }
      if (line.trim() === "") {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        flushPara();
        continue;
      }
      inPara.push(line);
    }
    flushPara();
    if (inList) out.push("</ul>");
    if (inCode) out.push("</code></pre>");
    return out.join("\n");
  }

  private static inline(s: string) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary hover:underline">$1</a>'
      );
  }
}

/**
 * Loads markdown from /content/{blog|changelog|help} and renders for marketing pages.
 */
export class MarketingContentPipeline {
  constructor(
    private readonly renderer = new MarkdownRenderer(),
    private readonly cwd = process.cwd()
  ) {}

  renderMarkdown(md: string): string {
    return this.renderer.render(md);
  }

  getBlogPosts(): ContentEntry[] {
    return this.readDir("blog");
  }

  getChangelog(): ContentEntry[] {
    return this.readDir("changelog");
  }

  getHelpArticles(): ContentEntry[] {
    return this.readDir("help");
  }

  getEntry(kind: "blog" | "changelog" | "help", slug: string): ContentEntry | null {
    const list =
      kind === "blog"
        ? this.getBlogPosts()
        : kind === "changelog"
          ? this.getChangelog()
          : this.getHelpArticles();
    return list.find((e) => e.slug === slug) ?? null;
  }

  private readDir(dir: string): ContentEntry[] {
    const full = path.join(this.cwd, "content", dir);
    if (!fs.existsSync(full)) return [];
    return fs
      .readdirSync(full)
      .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
      .map((f) => this.parseFile(path.join(full, f)))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  private parseFile(filepath: string): ContentEntry {
    const raw = fs.readFileSync(filepath, "utf8");
    const slug = path.basename(filepath).replace(/\.(mdx?|md)$/, "");

    const fm = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const body = fm ? fm[2] : raw;
    const meta: Record<string, string> = {};
    if (fm) {
      for (const line of fm[1].split("\n")) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }

    return {
      slug,
      title: meta.title ?? slug,
      date: meta.date ?? "1970-01-01",
      description: meta.description,
      author: meta.author,
      body,
    };
  }
}

export const marketingContentPipeline = new MarketingContentPipeline();

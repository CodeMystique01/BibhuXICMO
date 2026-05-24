"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";

/**
 * Three lightweight export options for a draft:
 *   1. Markdown — original body downloaded as `.md`. Zero conversion.
 *   2. Word    — Markdown rendered to HTML, wrapped in a Word-friendly
 *                container with `Content-Type: application/msword`,
 *                downloaded as `.doc`. Word + Google Docs open it
 *                natively.
 *   3. PDF     — opens a print-ready window with the rendered HTML and
 *                fires the browser's print dialog → user picks
 *                "Save as PDF".
 *
 * All three run entirely client-side, no server round trip, no extra
 * npm deps.
 */
export function ExportButtons({
  title,
  body,
  filenameBase,
}: {
  title: string;
  body: string;
  filenameBase?: string;
}) {
  const [busy, setBusy] = useState<"md" | "doc" | "pdf" | null>(null);

  const safeName =
    (filenameBase ?? title ?? "draft")
      .toLowerCase()
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "draft";

  function downloadMarkdown() {
    setBusy("md");
    try {
      const md = `# ${title}\n\n${body}`;
      triggerDownload(
        new Blob([md], { type: "text/markdown;charset=utf-8" }),
        `${safeName}.md`
      );
      toast.success("Markdown exported");
    } catch (err) {
      toast.error("Markdown export failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  function downloadWord() {
    setBusy("doc");
    try {
      const html = mdToHtml(body);
      const wrapper = buildWordHtml(title, html);
      triggerDownload(
        new Blob([wrapper], { type: "application/msword;charset=utf-8" }),
        `${safeName}.doc`
      );
      toast.success("Word doc exported");
    } catch (err) {
      toast.error("Word export failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  function printToPdf() {
    setBusy("pdf");
    try {
      const html = mdToHtml(body);
      const win = window.open("", "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Browser blocked the print window", {
          description: "Allow pop-ups for this site and try again.",
        });
        return;
      }
      win.document.write(buildPrintHtml(title, html));
      win.document.close();
      // Give the new doc a tick to paint, then fire print dialog.
      setTimeout(() => {
        win.focus();
        win.print();
      }, 250);
      toast.success("Opened print preview", {
        description: "Pick 'Save as PDF' as the destination.",
      });
    } catch (err) {
      toast.error("Print failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={downloadMarkdown}
        disabled={busy === "md"}
      >
        {busy === "md" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Markdown
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={downloadWord}
        disabled={busy === "doc"}
      >
        {busy === "doc" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        Word (.doc)
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={printToPdf}
        disabled={busy === "pdf"}
      >
        {busy === "pdf" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
        Print to PDF
      </Button>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer revoke so Safari has time to honour the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

// -----------------------------------------------------------------
//  Lightweight Markdown -> HTML for export only (not WYSIWYG).
//  Covers: headings, bold/italic/code, links, images, lists, hr,
//  blockquotes, paragraphs. Skips tables / footnotes / nested lists
//  — fine for exported blog drafts which use simple structure.
// -----------------------------------------------------------------

function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (/^\s*$/.test(line)) {
      flushPara();
      closeList();
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push("<hr />");
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      if (inList !== "ul") {
        closeList();
        out.push("<ul>");
        inList = "ul";
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inList !== "ol") {
        closeList();
        out.push("<ol>");
        inList = "ol";
      }
      out.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Default: accumulate paragraph
    if (inList) closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

function inline(s: string): string {
  let r = escapeHtml(s);
  // Images first (![alt](url)) — must run before plain links.
  r = r.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    return `<img alt="${attr(alt)}" src="${attr(url)}" />`;
  });
  // Links [text](url)
  r = r.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    return `<a href="${attr(url)}">${label}</a>`;
  });
  // Bold **x** then italic *x* (avoid swallowing the bold pair).
  r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Inline code `x`
  r = r.replace(/`([^`]+)`/g, "<code>$1</code>");
  return r;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function attr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------
//  Document wrappers
// -----------------------------------------------------------------

function buildWordHtml(title: string, bodyHtml: string): string {
  // The HTML+MSO meta combo is Word's native way to open HTML as a doc.
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <xml>
    <w:WordDocument><w:View>Print</w:View></w:WordDocument>
  </xml>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
    h1 { font-size: 22pt; margin: 0 0 12pt; }
    h2 { font-size: 16pt; margin: 18pt 0 6pt; }
    h3 { font-size: 13pt; margin: 14pt 0 6pt; }
    p, li { line-height: 1.5; }
    a { color: #2563eb; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 3pt solid #ccc; padding-left: 10pt; color: #555; }
    code { background: #f4f4f4; padding: 1pt 4pt; border-radius: 2pt; font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

function buildPrintHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt; color: #1a1a1a; max-width: 760px; margin: 0 auto;
    }
    h1 { font-size: 26pt; margin: 0 0 14pt; }
    h2 { font-size: 18pt; margin: 22pt 0 8pt; border-bottom: 1px solid #eee; padding-bottom: 4pt; }
    h3 { font-size: 14pt; margin: 16pt 0 6pt; }
    p, li { line-height: 1.65; margin: 0 0 10pt; }
    a { color: #6d28d9; text-decoration: underline; }
    img { max-width: 100%; height: auto; border-radius: 6pt; }
    blockquote { border-left: 3pt solid #c4b5fd; padding-left: 12pt; color: #555; margin: 12pt 0; }
    code { background: #f1f1f1; padding: 1pt 4pt; border-radius: 3pt; font-family: ui-monospace, Consolas, monospace; font-size: 10pt; }
    ul, ol { padding-left: 24pt; }
    hr { border: none; border-top: 1px solid #eee; margin: 18pt 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
  <script>
    window.addEventListener("afterprint", () => setTimeout(() => window.close(), 300));
  </script>
</body>
</html>`;
}

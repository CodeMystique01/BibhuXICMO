import Link from "next/link";
import { Logo } from "./logo";
import { SITE_NAME } from "@/shared/site";

const LEARN = [
  { href: "/blog", label: "Blog" },
  { href: "/changelog", label: "Changelog" },
  { href: "/help", label: "Help Center" },
  { href: "/contact", label: "Contact" },
];

const COMPANY = [
  { href: "/pricing", label: "Pricing" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/careers", label: "Careers" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund", label: "Refund Policy" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/10">
      <div className="container py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {SITE_NAME} — autonomous marketing and distribution for growing teams.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold">Learn</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {LEARN.map((l) => (
                <li key={l.href}>
                  <Link className="hover:text-foreground" href={l.href}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {COMPANY.map((l) => (
                <li key={l.href}>
                  <Link className="hover:text-foreground" href={l.href}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold">Tools</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link className="hover:text-foreground" href="/tools/chat-with-pdf">
                  Chat with PDF
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/tools/chat-with-youtube">
                  Chat with YouTube
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/tools/chat-with-x">
                  Chat with X
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/tools/web-search">
                  Web Research
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t pt-8 md:flex-row md:items-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

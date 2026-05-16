import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { ThemeToggle } from "@/frontend/components/ui/theme-toggle";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "/#agents", label: "Agents" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tools", label: "Free Tools" },
  { href: "/blog", label: "Blog" },
  { href: "/changelog", label: "Changelog" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tools/private-chat"
            className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-foreground"
          >
            Looking for Private Chat?
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  Hash,
  Home,
  Instagram,
  Layers,
  Link2,
  Linkedin,
  MessageCircle,
  MessageSquare,
  Newspaper,
  Plug,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Youtube,
} from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/shared/utils";
import { Logo } from "@/frontend/components/marketing/logo";
import { ThemeToggle } from "@/frontend/components/ui/theme-toggle";
import type { Plan } from "@/frontend/components/ui/plan-badge";
import { useSidebar } from "./sidebar-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/agent/cmo", label: "AI CMO", icon: Bot },
  { href: "/actions", label: "Action Items", icon: Sparkles },
  { href: "/content", label: "Content Library", icon: FileText },
  { href: "/queue", label: "Publish Queue", icon: Layers },
  { href: "/chat", label: "Private Chat", icon: MessageSquare },
];

const AGENTS = [
  { href: "/agents/seo", label: "SEO", icon: Search },
  { href: "/agents/geo", label: "GEO", icon: Sparkles },
  { href: "/agents/content", label: "Content Writer", icon: FileText },
  { href: "/agents/reddit-sales", label: "Reddit Sales", icon: MessageCircle },
  { href: "/agents/hn", label: "Hacker News", icon: Newspaper },
  { href: "/agents/x", label: "X / Twitter", icon: Hash },
  { href: "/agents/linkedin", label: "LinkedIn", icon: Linkedin },
  // Influencer + backlink modules — UI stubs for now, backend coming next.
  { href: "/agents/youtube-creators", label: "YT Creators", icon: Youtube },
  { href: "/agents/instagram", label: "Insta Influencers", icon: Instagram },
  { href: "/agents/backlink-marketplace", label: "Backlink Marketplace", icon: Link2 },
];

const DATA = [
  { href: "/integrations/gsc", label: "Search Console", icon: TrendingUp },
  { href: "/integrations/ga4", label: "Google Analytics", icon: BarChart3 },
];

const SETTINGS = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  workspaceName,
  workspaceId,
  plan,
}: {
  workspaceName: string;
  workspaceId: string;
  plan: Plan;
}) {
  const { mobileOpen, close } = useSidebar();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!mobileOpen}
        onClick={close}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r bg-background transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 md:bg-muted/20",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 items-center justify-between border-b px-6">
          <Logo />
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b">
          <WorkspaceSwitcher
            current={{ id: workspaceId, name: workspaceName, plan }}
            others={[]}
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <Section items={MAIN} />
          <SectionTitle>Agents</SectionTitle>
          <Section items={AGENTS} icon={Bot} />
          <SectionTitle>Data</SectionTitle>
          <Section items={DATA} />
          <SectionTitle>Workspace</SectionTitle>
          <Section items={SETTINGS} />
        </nav>

        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Section({
  items,
  icon: DefaultIcon,
}: {
  items: { href: string; label: string; icon: React.ElementType }[];
  icon?: React.ElementType;
}) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon || DefaultIcon || Home;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

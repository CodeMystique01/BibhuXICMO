"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  Briefcase,
  CreditCard,
  FileText,
  Hash,
  Home,
  Layers,
  Linkedin,
  LogOut,
  MessageCircle,
  MessageSquare,
  Newspaper,
  Plug,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/frontend/components/ui/command";

const NAVIGATE = [
  { label: "Dashboard", href: "/dashboard", icon: Home, shortcut: "g d" },
  { label: "AI CMO", href: "/agent/cmo", icon: Bot },
  { label: "Action Items", href: "/actions", icon: Sparkles, shortcut: "g a" },
  { label: "Content Library", href: "/content", icon: FileText },
  { label: "Publish Queue", href: "/queue", icon: Layers },
  { label: "Private Chat", href: "/chat", icon: MessageSquare, shortcut: "g c" },
  { label: "Settings", href: "/settings", icon: Settings, shortcut: "g s" },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Integrations", href: "/integrations", icon: Plug },
  { label: "Search Console", href: "/integrations/gsc", icon: TrendingUp },
  { label: "Google Analytics", href: "/integrations/ga4", icon: BarChart3 },
];

const AGENTS = [
  { label: "SEO Agent", href: "/agents/seo", icon: Search },
  { label: "GEO Agent", href: "/agents/geo", icon: Sparkles },
  { label: "Content Writer", href: "/agents/content", icon: FileText },
  { label: "Reddit Agent", href: "/agents/reddit", icon: MessageCircle },
  { label: "Hacker News Agent", href: "/agents/hn", icon: Newspaper },
  { label: "X / Twitter Agent", href: "/agents/x", icon: Hash },
  { label: "LinkedIn Agent", href: "/agents/linkedin", icon: Linkedin },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      // Forward slash (Notion-style) when not in a text input.
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAVIGATE.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.href}`}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              <span>{item.label}</span>
              {item.shortcut ? (
                <CommandShortcut>{item.shortcut}</CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Agents">
          {AGENTS.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.href}`}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              <span>Open {item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Workspace">
          <CommandItem
            value="theme light"
            onSelect={() => {
              setTheme("light");
              onOpenChange(false);
            }}
          >
            <Sun />
            <span>Theme: Light</span>
          </CommandItem>
          <CommandItem
            value="theme dark purple"
            onSelect={() => {
              setTheme("dark");
              onOpenChange(false);
            }}
          >
            <Sparkles />
            <span>Theme: Dark</span>
          </CommandItem>
          <CommandItem
            value="theme system"
            onSelect={() => {
              setTheme("system");
              onOpenChange(false);
            }}
          >
            <Briefcase />
            <span>Theme: System</span>
          </CommandItem>
          <CommandItem
            value="sign out logout"
            onSelect={() => {
              onOpenChange(false);
              signOut({ callbackUrl: "/" });
            }}
          >
            <LogOut />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

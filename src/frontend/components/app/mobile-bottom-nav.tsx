"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Bot, MessageSquare, FileText } from "lucide-react";
import { cn } from "@/shared/utils";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/agent/cmo", label: "CMO", icon: Bot },
  { href: "/actions", label: "Actions", icon: Sparkles },
  { href: "/content", label: "Library", icon: FileText },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

/**
 * Thumb-friendly bottom navigation bar shown only on mobile (`md:hidden`).
 * Mirrors the most-visited destinations from the sidebar.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t bg-background/95 backdrop-blur md:hidden"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-transform",
                active && "scale-110"
              )}
            />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

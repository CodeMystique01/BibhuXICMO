"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Bell,
  CreditCard,
  LogOut,
  Menu,
  Newspaper,
  Search,
  Settings,
  User as UserIcon,
  Zap,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { PlanBadge, type Plan } from "@/frontend/components/ui/plan-badge";
import { UpgradeButton } from "./upgrade-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { useSidebar } from "./sidebar-context";

export function Topbar({
  credits,
  user,
  plan,
  onOpenPalette,
  onOpenNotifications,
  unreadNotifications = 0,
}: {
  credits: number;
  user: { name: string | null; email: string; image: string | null };
  plan: Plan;
  onOpenPalette?: () => void;
  onOpenNotifications?: () => void;
  unreadNotifications?: number;
}) {
  const { open } = useSidebar();
  const initial = (user.name || user.email)?.charAt(0).toUpperCase() || "?";

  return (
    <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={open}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Command palette trigger — visible on md+ as a search-like input */}
        {onOpenPalette ? (
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted md:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search or jump to…</span>
            <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
        ) : null}

        <Badge variant="outline" className="gap-1.5">
          <Zap className="h-3 w-3 text-primary" />
          <span className="text-xs tabular-nums">
            {credits.toLocaleString()}
          </span>
        </Badge>
        <PlanBadge plan={plan} className="hidden sm:inline-flex" />
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {plan === "FREE" && (
          <UpgradeButton
            size="sm"
            variant="outline"
            className="hidden md:inline-flex"
          />
        )}

        {onOpenNotifications ? (
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 ? (
              <span className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            ) : null}
          </button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-accent"
              aria-label="Account menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {initial}
              </span>
              <span className="hidden text-xs leading-tight md:block">
                <span className="block max-w-[12rem] truncate font-medium">
                  {user.name || user.email}
                </span>
                <span className="block max-w-[12rem] truncate text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserIcon className="h-4 w-4" />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/billing">
                <CreditCard className="h-4 w-4" />
                Plan &amp; billing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/integrations">
                <Settings className="h-4 w-4" />
                Integrations
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Resources</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/changelog">
                <Newspaper className="h-4 w-4" />
                What&rsquo;s new
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help">
                <Search className="h-4 w-4" />
                Help center
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                signOut({ callbackUrl: "/" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

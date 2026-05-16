"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { SidebarProvider } from "./sidebar-context";
import { CommandPalette } from "./command-palette";
import { CommandPaletteContext } from "./command-palette-context";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { MobileBottomNav } from "./mobile-bottom-nav";
import {
  NotificationsDrawer,
  type NotificationItem,
} from "./notifications-drawer";
import type { Plan } from "@/frontend/components/ui/plan-badge";

export function AppShell({
  user,
  workspaceName,
  workspaceId,
  plan,
  credits,
  children,
}: {
  user: { name: string | null; email: string; image: string | null };
  workspaceName: string;
  workspaceId: string;
  plan: Plan;
  credits: number;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  // Fetch notifications once on mount + every 60s in the background.
  // Ensures tab navigations don't pay a notifications DB query each time.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: NotificationItem[];
          unread: number;
        };
        if (cancelled) return;
        setNotifications(data.items);
        setUnread(data.unread);
      } catch {
        // ignore — drawer just stays empty
      }
    }

    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <CommandPaletteContext.Provider
      value={{ open: () => setPaletteOpen(true) }}
    >
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar
            workspaceName={workspaceName}
            workspaceId={workspaceId}
            plan={plan}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              credits={credits}
              user={user}
              plan={plan}
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenNotifications={() => setNotifOpen(true)}
              unreadNotifications={unread}
            />
            <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:py-8 md:pb-8">
              {children}
            </main>
          </div>

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
          />
          <NotificationsDrawer
            open={notifOpen}
            onOpenChange={setNotifOpen}
            items={notifications}
          />
          <KeyboardShortcuts />
          <MobileBottomNav />
        </div>
      </SidebarProvider>
    </CommandPaletteContext.Provider>
  );
}

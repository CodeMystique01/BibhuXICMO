"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/frontend/components/ui/sheet";
import { Badge } from "@/frontend/components/ui/badge";

export type NotificationItem = {
  id: string;
  kind: "agent.success" | "agent.failed" | "action.new" | "info";
  title: string;
  description?: string;
  href?: string;
  createdAt: string;
};

export function NotificationsDrawer({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NotificationItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </SheetTitle>
          <SheetDescription>
            Recent agent runs and new action items in your workspace.
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-2 mt-4 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No notifications yet. Run an agent to see updates here.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Body = (
                  <div className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-accent/40">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon kind={n.kind} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {labelFor(n.kind)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium leading-snug">
                        {n.title}
                      </p>
                      {n.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => onOpenChange(false)}
                        className="block"
                      >
                        {Body}
                      </Link>
                    ) : (
                      Body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Icon({ kind }: { kind: NotificationItem["kind"] }) {
  if (kind === "agent.success")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (kind === "agent.failed")
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (kind === "action.new") return <Sparkles className="h-4 w-4 text-primary" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

function labelFor(k: NotificationItem["kind"]) {
  if (k === "agent.success") return "Agent run";
  if (k === "agent.failed") return "Agent failed";
  if (k === "action.new") return "New action";
  return "Info";
}

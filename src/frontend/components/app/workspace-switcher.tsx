"use client";

import { Briefcase, Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { PlanBadge, type Plan } from "@/frontend/components/ui/plan-badge";
import Link from "next/link";

export type WorkspaceSummary = {
  id: string;
  name: string;
  plan: Plan;
};

/**
 * Compact dropdown listing all workspaces the user is a member of.
 * Switching workspaces is not yet wired (single workspace per user today),
 * so non-current entries are placeholders. Keeps the door open for multi-WS.
 */
export function WorkspaceSwitcher({
  current,
  others,
}: {
  current: WorkspaceSummary;
  others: WorkspaceSummary[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-accent/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Briefcase className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {current.name}
            </span>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <PlanBadge plan={current.plan} />
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{current.name}</span>
        </DropdownMenuItem>
        {others.map((w) => (
          <DropdownMenuItem key={w.id} disabled>
            <span className="h-3.5 w-3.5" />
            <span className="truncate">{w.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              soon
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Plus className="h-3.5 w-3.5" />
            New workspace (coming soon)
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

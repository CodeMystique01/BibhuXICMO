"use client";

import Link from "next/link";
import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, Check, X as XIcon } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { resolveActionItem } from "@/app/(app)/agents/actions";

type Item = {
  id: string;
  title: string;
  summary: string | null;
  agent: string;
  priority: string;
  cta: string | null;
  href: string | null;
  createdAt: Date;
};

export function ActionItemRow({ item }: { item: Item }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <PriorityDot p={item.priority} />
          <Badge variant="outline" className="text-[10px]">
            {item.agent}
          </Badge>
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.summary}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {formatDistanceToNow(item.createdAt, { addSuffix: true })}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        {item.href && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={item.href}>
              {item.cta || "Open"}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          title="Mark done"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveActionItem(item.id, "DONE");
              toast.success("Marked done");
            })
          }
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Dismiss"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveActionItem(item.id, "DISMISSED");
            })
          }
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function PriorityDot({ p }: { p: string }) {
  const color =
    p === "URGENT"
      ? "bg-red-500"
      : p === "HIGH"
        ? "bg-orange-500"
        : p === "MEDIUM"
          ? "bg-amber-500"
          : "bg-slate-400";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

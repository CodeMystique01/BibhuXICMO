import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "./button";

/**
 * Generic empty-state. Renders a centered icon, headline, and one or two CTAs.
 * Use anywhere a list/section is empty so users always know what to do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {primaryAction ? (
            <Button asChild size="sm">
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button asChild size="sm" variant="outline">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

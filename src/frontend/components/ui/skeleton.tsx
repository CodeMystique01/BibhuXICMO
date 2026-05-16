import { cn } from "@/shared/utils";

/**
 * Lightweight loading placeholder. Renders a muted, pulsing rectangle.
 * Used in Suspense fallbacks and `loading.tsx` boundaries.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}

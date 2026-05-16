import Link from "next/link";
import { cn } from "@/shared/utils";
import { SITE_NAME } from "@/shared/site";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      <span
        aria-hidden
        className="relative flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-sm"
      >
        <span className="absolute inset-0 rounded-md bg-primary/20 blur-md" />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="relative h-5 w-5"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2 L4 7 L12 12 L20 7 Z" />
          <path d="M4 12 L12 17 L20 12" />
          <path d="M4 17 L12 22 L20 17" />
        </svg>
      </span>
      {showWordmark && (
        <span className="text-base tracking-tight">
          <span className="text-primary">{SITE_NAME.slice(0, 1)}</span>
          {SITE_NAME.slice(1)}
        </span>
      )}
    </Link>
  );
}

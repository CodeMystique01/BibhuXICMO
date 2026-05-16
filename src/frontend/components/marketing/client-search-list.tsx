"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Search, X } from "lucide-react";

export type SearchableEntry = {
  slug: string;
  title: string;
  description?: string | null;
  date?: string;
  href: string;
};

/**
 * Tiny client-side filter for marketing lists (blog, help center).
 * Matches title + description case-insensitively. Re-renders the list
 * with visible-only items.
 */
export function ClientSearchList({
  entries,
  showDates = false,
  emptyText = "No matches found.",
  placeholder = "Search…",
}: {
  entries: SearchableEntry[];
  showDates?: boolean;
  emptyText?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => {
      const hay = `${e.title} ${e.description ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [entries, q]);

  return (
    <div>
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border bg-background pl-9 pr-9 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y">
          {visible.map((e) => (
            <li key={e.slug} className="py-5">
              <Link href={e.href} className="group block">
                {showDates && e.date ? (
                  <time className="text-xs text-muted-foreground">
                    {format(new Date(e.date), "MMMM d, yyyy")}
                  </time>
                ) : null}
                <h2 className="mt-1 text-lg font-semibold group-hover:text-primary">
                  {e.title}
                </h2>
                {e.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {e.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

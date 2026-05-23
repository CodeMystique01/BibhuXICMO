"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * A competitor displayed as a clickable favicon pill, matching the
 * Okara-style brand row. Falls back to a coloured circle with the
 * first letter when the favicon fails to load.
 *
 * Favicons come from Google's free favicon service (no key, ~24h cache).
 * `domainOnly` strips protocol + www so "https://www.gumroad.com/foo"
 * normalises to "gumroad.com" before lookup.
 */
export function CompetitorPill({
  competitor,
  size = "md",
}: {
  competitor: string;
  size?: "sm" | "md";
}) {
  const domain = domainOnly(competitor);
  const display = stripScheme(competitor);
  const [imgOk, setImgOk] = useState(true);
  const px = size === "sm" ? 14 : 18;
  const containerSize = size === "sm" ? "h-6" : "h-7";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <a
      href={`https://${domain}`}
      target="_blank"
      rel="noreferrer noopener"
      title={display}
      className={`inline-flex ${containerSize} items-center gap-1.5 rounded-md border bg-background pl-1.5 pr-2 ${textSize} font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5`}
    >
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted"
        style={{ width: px, height: px }}
      >
        {imgOk ? (
          <Image
            src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`}
            alt=""
            width={px}
            height={px}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-muted-foreground"
            aria-hidden
          >
            {(domain[0] ?? "?").toUpperCase()}
          </span>
        )}
      </span>
      <span className="max-w-[10ch] truncate">{display}</span>
    </a>
  );
}

function stripScheme(s: string): string {
  return s
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

function domainOnly(s: string): string {
  const stripped = stripScheme(s);
  return stripped.split("/")[0]?.toLowerCase() ?? stripped.toLowerCase();
}

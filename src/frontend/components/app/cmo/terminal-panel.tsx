"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { Card, CardContent } from "@/frontend/components/ui/card";

export type TerminalLine = { kind: "info" | "ok" | "warn" | "muted"; text: string };

/** Renders a fake-live terminal: lines are revealed sequentially with a brief delay. */
export function TerminalPanel({
  lines,
  intervalMs = 220,
  className,
}: {
  lines: TerminalLine[];
  intervalMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = lines.length;
  const finalLines = useMemo(() => lines, [lines]);

  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((n) => Math.min(total, n + 1)), intervalMs);
    return () => clearTimeout(t);
  }, [shown, total, intervalMs]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  return (
    <Card
      className={
        "border-emerald-500/20 bg-zinc-950 font-mono text-[13px] text-zinc-100 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <Terminal className="h-4 w-4 text-emerald-400" aria-hidden />
        <span className="text-xs uppercase tracking-wider text-zinc-400">
          Live agent log
        </span>
        <span className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      </div>
      <CardContent
        ref={containerRef}
        className="max-h-56 space-y-1 overflow-y-auto py-3 text-zinc-300"
      >
        {finalLines.slice(0, shown).map((line, i) => (
          <div key={i} className="leading-relaxed">
            <span className="select-none text-zinc-500">&gt; </span>
            <span className={kindClass(line.kind)}>{line.text}</span>
            {i === shown - 1 && shown < total ? (
              <span className="ml-1 inline-block h-3 w-1.5 -translate-y-px animate-pulse bg-emerald-400 align-middle" />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function kindClass(k: TerminalLine["kind"]): string {
  switch (k) {
    case "ok":
      return "text-emerald-300";
    case "warn":
      return "text-amber-300";
    case "muted":
      return "text-zinc-500";
    case "info":
    default:
      return "text-zinc-200";
  }
}

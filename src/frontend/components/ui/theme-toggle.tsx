"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/utils";

const ORDER = ["light", "dark", "system"] as const;
type Mode = (typeof ORDER)[number];

const META: Record<Mode, { label: string; icon: typeof Sun }> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  system: { label: "System", icon: Monitor },
};

/** Cycles light → dark → system → light. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const current: Mode = (theme as Mode) ?? "system";
  const idx = ORDER.indexOf(current);
  const next: Mode = ORDER[(idx + 1) % ORDER.length];
  const Icon = META[current === "system" ? (resolvedTheme as "light" | "dark") ?? "light" : current].icon;
  const label = `Switch to ${META[next].label} mode (current: ${META[current].label})`;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

/** Three-button picker for settings pages. */
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-lg border bg-background p-1 text-xs"
    >
      {ORDER.map((m) => {
        const Icon = META[m].icon;
        const active = (theme as Mode) === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(m)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {META[m].label}
          </button>
        );
      })}
    </div>
  );
}

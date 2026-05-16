"use client";

import { useMemo } from "react";
import { cn } from "@/shared/utils";

/**
 * Lightweight password strength indicator. Pure heuristic — no external deps.
 *
 * Score: 0 = empty, 1 = weak, 2 = fair, 3 = good, 4 = strong.
 * Used purely for UX feedback; the server still enforces minLength + a real check.
 */
function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, Math.max(1, score));
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const COLORS = [
  "bg-muted",
  "bg-red-500",
  "bg-amber-500",
  "bg-blue-500",
  "bg-green-500",
] as const;

export function PasswordStrength({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const score = useMemo(() => scorePassword(password), [password]);
  if (!password) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-1 gap-1 overflow-hidden rounded-full">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i <= score ? COLORS[score] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Password strength:{" "}
        <span className="font-medium text-foreground">{LABELS[score]}</span>
        {score < 3 ? (
          <span> — try mixing letters, numbers, and symbols.</span>
        ) : null}
      </p>
    </div>
  );
}

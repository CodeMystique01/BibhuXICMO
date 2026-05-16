"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * "g" leader keyboard shortcuts for fast navigation. Listens globally and
 * ignores keypresses while focus is in any text input.
 *
 * - g d → /dashboard
 * - g a → /actions
 * - g c → /chat
 * - g m → /agent/cmo
 * - g s → /settings
 * - g i → /integrations
 * - g q → /queue
 * - g l → /content (library)
 *
 * Mounted once globally next to the command palette.
 */
const G_MAP: Record<string, string> = {
  d: "/dashboard",
  a: "/actions",
  c: "/chat",
  m: "/agent/cmo",
  s: "/settings",
  i: "/integrations",
  q: "/queue",
  l: "/content",
};

export function KeyboardShortcuts() {
  const router = useRouter();
  const lastG = useRef<number>(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "g") {
        lastG.current = Date.now();
        return;
      }

      // Second key within 1.2s after "g".
      if (Date.now() - lastG.current < 1200) {
        const dest = G_MAP[e.key];
        if (dest) {
          e.preventDefault();
          lastG.current = 0;
          router.push(dest);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

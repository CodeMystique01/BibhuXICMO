"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server every `intervalMs` while a long-running analysis
 * (strategy regen, Ahrefs fetch, etc.) is in flight on the server.
 * Stops when the parent re-renders without the pending banner.
 *
 * Used in CompanyPanel — when websiteUrl is set but voiceProfile is
 * still empty, the background pipeline is filling it. router.refresh()
 * re-runs the server component, which re-evaluates whether the panel
 * still needs the "Analyzing your site..." state.
 */
export function AutoRefreshWhenPending({
  intervalMs = 15_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

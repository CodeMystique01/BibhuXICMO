"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A 2px top progress bar that fakes its way to ~80% over a few hundred ms,
 * then completes once the route finishes mounting. Pure CSS, no deps.
 *
 * Mounted once globally inside the root layout. It re-keys whenever pathname
 * or search params change, which is when Next.js triggers a route transition.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    setActive(true);
    setProgress(10);
    // Climb to 80% in ~400ms via 4 ticks.
    const ticks = [25, 45, 65, 80];
    const timeouts = ticks.map((p, i) =>
      setTimeout(() => {
        if (mounted) setProgress(p);
      }, (i + 1) * 100)
    );
    // Complete + hide a beat after the route mounts.
    const complete = setTimeout(() => {
      if (!mounted) return;
      setProgress(100);
      setTimeout(() => mounted && setActive(false), 220);
    }, 600);

    return () => {
      mounted = false;
      timeouts.forEach(clearTimeout);
      clearTimeout(complete);
    };
  }, [pathname, search]);

  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-primary via-fuchsia-500 to-primary shadow-[0_0_8px_var(--primary)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-red-500/20 text-amber-500">
        <AlertTriangle className="h-12 w-12" strokeWidth={1.4} />
      </div>

      <p className="mt-8 text-xs font-medium uppercase tracking-widest text-destructive">
        Something broke
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
        We hit an unexpected error.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        {error.message || "An unknown error occurred."}
      </p>
      {error.digest && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link
            href={`mailto:support@xicmo.com?subject=Error%20${encodeURIComponent(
              error.digest ?? error.message
            )}`}
          >
            Report this
          </Link>
        </Button>
      </div>
    </div>
  );
}

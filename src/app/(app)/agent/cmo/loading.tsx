export default function CmoLoading() {
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded-md bg-muted/70" />
          <div className="ml-auto h-7 w-28 animate-pulse rounded-full bg-muted/60" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
        {/* Company panel */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 w-full animate-pulse rounded bg-muted/60" />
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        </div>

        {/* Center column — analytics + actions feed */}
        <div className="space-y-6">
          {/* Tabs */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-7 w-20 animate-pulse rounded-md bg-muted/60" />
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-4">
                  <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                  <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
                  <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted/40" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          </div>
        </div>

        {/* Right column — chat + terminal */}
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-40 animate-pulse rounded-md bg-muted/50" />
            <div className="mt-3 h-9 animate-pulse rounded-md bg-muted/40" />
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-4 space-y-2 font-mono text-xs">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded bg-muted/50"
                  style={{ width: `${50 + ((i * 13) % 50)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

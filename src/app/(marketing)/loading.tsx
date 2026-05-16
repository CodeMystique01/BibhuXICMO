export default function MarketingLoading() {
  return (
    <div className="container max-w-5xl py-16 md:py-24">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="mx-auto h-3 w-24 animate-pulse rounded-full bg-muted/70" />
        <div className="mx-auto h-12 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="mx-auto h-4 w-2/3 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl bg-muted/50"
          />
        ))}
      </div>
    </div>
  );
}

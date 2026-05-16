import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}

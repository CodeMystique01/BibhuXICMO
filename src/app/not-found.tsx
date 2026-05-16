import Link from "next/link";
import { Sparkles, MessageSquare, Search } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Logo } from "@/frontend/components/marketing/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />

      <div className="mt-10 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary">
        <Search className="h-12 w-12" strokeWidth={1.4} />
      </div>

      <p className="mt-8 text-xs font-medium uppercase tracking-widest text-primary">
        404 — Page not found
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
        That page slipped through the cracks.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The link may have moved or never existed. Here are some good places to land.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Sparkles className="h-4 w-4" />
            My workspace
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/help">
            <MessageSquare className="h-4 w-4" />
            Help center
          </Link>
        </Button>
      </div>
    </div>
  );
}

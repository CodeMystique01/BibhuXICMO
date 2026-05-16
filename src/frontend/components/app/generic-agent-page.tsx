import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { RunAgentButton } from "@/frontend/components/app/run-agent-button";

type Run = {
  id: string;
  status: string;
  startedAt: Date;
  creditsUsed: number;
};

type Draft = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  createdAt: Date;
};

export function GenericAgentPage({
  title,
  description,
  icon: Icon,
  agentId,
  runButton,
  emptyState,
  runs,
  drafts,
  connected,
  connectSlug,
  extras,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  agentId: string;
  runButton?: { label: string; input?: unknown };
  emptyState?: string;
  runs: Run[];
  drafts: Draft[];
  connected: boolean;
  connectSlug?: string;
  extras?: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          {connectSlug && !connected && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/integrations/${connectSlug}/start`}>
                Connect account
              </Link>
            </Button>
          )}
          {runButton && (
            <RunAgentButton
              agentId={agentId}
              label={runButton.label}
              input={runButton.input}
            />
          )}
        </div>
      </div>

      {connectSlug && !connected && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          Connect your {title.replace(" Agent", "")} account to unlock publishing.
          Drafts will still be generated without it.
        </div>
      )}

      {extras}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent drafts</CardTitle>
            <CardDescription>Awaiting your approval.</CardDescription>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                {emptyState ?? "No drafts yet."}
              </p>
            ) : (
              <ul className="divide-y">
                {drafts.map((d) => (
                  <li key={d.id} className="py-3">
                    <Link
                      href={`/content/${d.id}`}
                      className="block hover:text-primary"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {d.status.toLowerCase().replace("_", " ")}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {d.title || "Untitled"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {d.body.slice(0, 180)}
                      </p>
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {format(d.createdAt, "MMM d · HH:mm")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between"
                  >
                    <span>{format(r.startedAt, "MMM d · HH:mm")}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {r.creditsUsed} credits
                      </span>
                      <Badge
                        variant={
                          r.status === "SUCCESS"
                            ? "success"
                            : r.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status.toLowerCase()}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { format } from "date-fns";
import {
  MessageCircle,
  Hash,
  Linkedin,
  TrendingUp,
  BarChart3,
  Github,
  Check,
  Plug,
} from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { getProviderConfig } from "@/integrations/providers";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { DisconnectButton } from "./disconnect-client";
import type { IntegrationProvider } from "@prisma/client";

export const metadata = { title: "Integrations" };

const PROVIDERS: Array<{
  provider: IntegrationProvider;
  slug: string;
  name: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    provider: "REDDIT",
    slug: "reddit",
    name: "Reddit",
    description: "Let the Reddit agent discover threads and post replies after you approve.",
    icon: MessageCircle,
  },
  {
    provider: "TWITTER",
    slug: "twitter",
    name: "X / Twitter",
    description: "Generate and publish post + thread drafts to your X account.",
    icon: Hash,
  },
  {
    provider: "LINKEDIN",
    slug: "linkedin",
    name: "LinkedIn",
    description: "Draft and publish posts to your personal LinkedIn profile.",
    icon: Linkedin,
  },
  {
    provider: "GOOGLE_SEARCH_CONSOLE",
    slug: "gsc",
    name: "Google Search Console",
    description: "Pull top queries, pages, CTR, and positions to surface opportunities.",
    icon: TrendingUp,
  },
  {
    provider: "GOOGLE_ANALYTICS",
    slug: "ga4",
    name: "Google Analytics (GA4)",
    description: "Import sessions, conversions, and top pages to inform strategy.",
    icon: BarChart3,
  },
  {
    provider: "GITHUB",
    slug: "github",
    name: "GitHub",
    description: "Let the Coding Agent open pull requests with technical SEO fixes.",
    icon: Github,
  },
];

export default async function IntegrationsPage(props: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const { workspace } = await requireWorkspace();
  const rows = await prisma.integration.findMany({
    where: { workspaceId: workspace.id },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your channels and data sources. Each agent unlocks more capability when
          its integration is linked.
        </p>
      </div>

      {sp.connected && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm">
          Connected <strong>{sp.connected}</strong> successfully.
        </div>
      )}
      {sp.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          Connection failed: {sp.error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const existing = byProvider.get(p.provider);
          const configured = !!getProviderConfig(p.provider);
          const Icon = p.icon;

          return (
            <Card key={p.provider}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {p.description}
                      </CardDescription>
                    </div>
                  </div>
                  {existing ? (
                    <Badge variant="success" className="gap-1">
                      <Check className="h-3 w-3" />
                      connected
                    </Badge>
                  ) : configured ? null : (
                    <Badge variant="outline">env not set</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {existing ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Since {format(existing.createdAt, "MMM d, yyyy")}
                    </span>
                    <DisconnectButton provider={p.provider} />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={!configured}
                    asChild={configured}
                  >
                    {configured ? (
                      <Link href={`/api/integrations/${p.slug}/start`}>
                        Connect {p.name}
                      </Link>
                    ) : (
                      <span>Set {envKeyForProvider(p.provider)} to enable</span>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function envKeyForProvider(p: IntegrationProvider): string {
  switch (p) {
    case "REDDIT":
      return "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET";
    case "TWITTER":
      return "X_CLIENT_ID / X_CLIENT_SECRET";
    case "LINKEDIN":
      return "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET";
    case "GOOGLE_SEARCH_CONSOLE":
    case "GOOGLE_ANALYTICS":
      return "GSC_CLIENT_ID / GSC_CLIENT_SECRET";
    case "GITHUB":
      return "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET";
  }
}

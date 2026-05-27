import { format } from "date-fns";
import { Sparkles, Check, X } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { hasSeoApifyToken } from "@/backend/ahrefs-tools";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { RunAgentButton } from "@/frontend/components/app/run-agent-button";
import { GeoTools } from "./geo-tools";
import { AiCitationsPanel } from "./ai-citations-panel";
import {
  PLATFORMS,
  type AiCitationsBundle,
  type PlatformKey,
  type PlatformCounts,
} from "./ai-citations-types";

export const metadata = { title: "GEO Agent" };

function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

const CITATIONS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function mapProviderToPlatform(name: string): PlatformKey | null {
  const s = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  if (s.includes("aioverview") || s.includes("googleaio") || s === "aio" || s === "sge")
    return "aiOverviews";
  if (s.includes("gemini") || s.includes("bard") || s.startsWith("googleai"))
    return "gemini";
  if (
    s.includes("chatgpt") ||
    s.includes("openai") ||
    s.startsWith("gpt") ||
    s.startsWith("o1") ||
    s.startsWith("o3") ||
    s.startsWith("o4") ||
    s.includes("davinci")
  )
    return "chatgpt";
  if (
    s.includes("claude") ||
    s.includes("anthropic") ||
    s.includes("haiku") ||
    s.includes("sonnet") ||
    s.includes("opus")
  )
    return "chatgpt";
  if (s.includes("perplexity") || s === "pplx") return "perplexity";
  if (s.includes("copilot") || s.includes("bingchat") || s === "bing") return "copilot";
  if (s.includes("grok") || s === "xai") return "grok";
  return null;
}

function aggregateProbes(
  probes: Array<{ provider: string; cited: boolean; prompt: string; checkedAt: Date }>,
  windowStart: number,
  windowEnd: number
): Partial<Record<PlatformKey, PlatformCounts>> {
  const byPlatform = new Map<PlatformKey, { citations: number; prompts: Set<string> }>();
  for (const p of probes) {
    if (!p.cited) continue;
    const t = p.checkedAt.getTime();
    if (t < windowStart || t >= windowEnd) continue;
    const platform = mapProviderToPlatform(p.provider);
    if (!platform) continue;
    if (!byPlatform.has(platform)) {
      byPlatform.set(platform, { citations: 0, prompts: new Set() });
    }
    const entry = byPlatform.get(platform)!;
    entry.citations++;
    entry.prompts.add(p.prompt.trim().toLowerCase());
  }
  const out: Partial<Record<PlatformKey, PlatformCounts>> = {};
  for (const [k, v] of byPlatform.entries()) {
    out[k] = { citations: v.citations, pages: v.prompts.size };
  }
  return out;
}

async function loadInitialBundle(
  workspaceId: string,
  domain: string
): Promise<AiCitationsBundle | null> {
  if (!domain) return null;
  const now = Date.now();
  const probes = await prisma.geoQuery.findMany({
    where: {
      workspaceId,
      checkedAt: { gte: new Date(now - 2 * CITATIONS_WINDOW_MS) },
    },
    select: { provider: true, cited: true, prompt: true, checkedAt: true },
  });
  if (probes.length === 0) return null;
  const current = aggregateProbes(probes, now - CITATIONS_WINDOW_MS, now);
  const previous = aggregateProbes(
    probes,
    now - 2 * CITATIONS_WINDOW_MS,
    now - CITATIONS_WINDOW_MS
  );
  const latestTs = probes.reduce((a, p) => Math.max(a, p.checkedAt.getTime()), 0);
  return {
    domain,
    country: "us",
    fetchedAt: new Date(latestTs).toISOString(),
    previousAt: new Date(now - CITATIONS_WINDOW_MS).toISOString(),
    current,
    previous,
  };
}

export default async function GeoAgentPage() {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(workspace.websiteUrl);

  const [recentProbes, citationsBundle] = await Promise.all([
    prisma.geoQuery.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { checkedAt: "desc" },
      take: 25,
    }),
    loadInitialBundle(workspace.id, domain),
  ]);

  // Quick header stat — total citations across all platforms today.
  const totalCitations = citationsBundle
    ? PLATFORMS.reduce(
        (acc, p) => acc + (citationsBundle.current[p.key]?.citations ?? 0),
        0
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">GEO Agent</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track citations from AI Overviews, ChatGPT, Gemini, Perplexity, Copilot, and Grok.
            {totalCitations > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {totalCitations.toLocaleString()}
                </span>{" "}
                total citations in the latest snapshot.
              </>
            )}
          </p>
        </div>
        <RunAgentButton agentId="geo" label="Run GEO check" />
      </div>

      <AiCitationsPanel initial={citationsBundle} domain={domain} />

      <GeoTools
        defaultDomain={domain}
        hasApifyToken={hasSeoApifyToken()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent LLM probes</CardTitle>
          <CardDescription>
            Manual citation checks from the GEO Tools → Citation Check tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentProbes.length === 0 ? (
            <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No probes yet. Open <span className="font-medium">GEO Tools → Citation Check</span> to
              probe LLMs for any query.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentProbes.map((p) => (
                <li key={p.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.provider}
                        </Badge>
                        <span className="font-medium">{p.prompt}</span>
                      </div>
                      {p.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {p.snippet}
                        </p>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {format(p.checkedAt, "MMM d · HH:mm")}
                      </div>
                    </div>
                    {p.cited ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" />
                        cited
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <X className="h-3 w-3" />
                        not cited
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

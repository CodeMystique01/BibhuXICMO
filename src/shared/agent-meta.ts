/**
 * UI-side metadata for agents. Lives in `shared/` so server & client can both
 * import it without pulling in the full agent runtime.
 *
 * - `id` — agent identifier (matches AgentRun.agent column).
 * - `label` — display name shown in buttons and badges.
 * - `creditsApprox` — rough credits a single run will burn, for UX hints
 *   ("Run audit ≈ 12 credits"). The real cost is metered server-side.
 * - `description` — one-liner for dashboards / command palette tooltips.
 */
export type AgentMeta = {
  id: string;
  label: string;
  creditsApprox: number;
  description: string;
  href: string;
};

export const AGENT_META: Record<string, AgentMeta> = {
  seo: {
    id: "seo",
    label: "SEO",
    creditsApprox: 8,
    description: "Daily site audit, keyword extraction, ranking checks.",
    href: "/agents/seo",
  },
  geo: {
    id: "geo",
    label: "GEO",
    creditsApprox: 18,
    description: "Probe LLMs for AI-search visibility on your seed queries.",
    href: "/agents/geo",
  },
  content: {
    id: "content",
    label: "Content Writer",
    creditsApprox: 14,
    description: "Draft long-form posts grounded in your voice profile.",
    href: "/agents/content",
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    creditsApprox: 6,
    description: "Find buying-intent threads and draft authentic replies.",
    href: "/agents/reddit",
  },
  hn: {
    id: "hn",
    label: "Hacker News",
    creditsApprox: 4,
    description:
      "Daily Show HN & Ask HN drafts, thread discovery, and comment suggestions — no HN API key.",
    href: "/agents/hn",
  },
  x: {
    id: "x",
    label: "X / Twitter",
    creditsApprox: 5,
    description: "Daily post drafts, reply suggestions, thread builders.",
    href: "/agents/x",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    creditsApprox: 5,
    description: "Founder-voice posts and engagement-driven thought leadership.",
    href: "/agents/linkedin",
  },
  coding: {
    id: "coding",
    label: "Coding",
    creditsApprox: 12,
    description: "Open small dev PRs against your connected GitHub repo.",
    href: "/agents/coding",
  },
};

export function getAgentMeta(id: string): AgentMeta | undefined {
  return AGENT_META[id];
}

export function listAgentMeta(): AgentMeta[] {
  return Object.values(AGENT_META);
}

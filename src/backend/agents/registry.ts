import type { Agent } from "./base";
import { seoAgent } from "./seo";
import { contentAgent } from "./content";
import { geoAgent } from "./geo";
import { redditAgent } from "./reddit";
import { hackerNewsAgent } from "./hn";
import { xAgent } from "./x";
import { instagramAgent } from "./instagram";
import { linkedinAgent } from "./linkedin";
import { codingAgent } from "./coding";

/**
 * Central registry of all agents. The dashboard iterates this map to build
 * its sidebar and run buttons, and the scheduler (Phase 8) uses each agent's
 * optional `schedule` cron expression.
 */
export const AGENT_REGISTRY: Record<string, Agent<unknown, unknown>> = {
  [seoAgent.id]: seoAgent as unknown as Agent<unknown, unknown>,
  [contentAgent.id]: contentAgent as unknown as Agent<unknown, unknown>,
  [geoAgent.id]: geoAgent as unknown as Agent<unknown, unknown>,
  [redditAgent.id]: redditAgent as unknown as Agent<unknown, unknown>,
  [hackerNewsAgent.id]: hackerNewsAgent as unknown as Agent<unknown, unknown>,
  [xAgent.id]: xAgent as unknown as Agent<unknown, unknown>,
  [instagramAgent.id]: instagramAgent as unknown as Agent<unknown, unknown>,
  [linkedinAgent.id]: linkedinAgent as unknown as Agent<unknown, unknown>,
  [codingAgent.id]: codingAgent as unknown as Agent<unknown, unknown>,
};

export function registerAgent(a: Agent<unknown, unknown>) {
  AGENT_REGISTRY[a.id] = a;
}

export function getAgent(id: string): Agent<unknown, unknown> | null {
  return AGENT_REGISTRY[id] ?? null;
}

export function listAgents(): Agent<unknown, unknown>[] {
  return Object.values(AGENT_REGISTRY);
}

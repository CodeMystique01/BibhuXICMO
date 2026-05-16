import { prisma } from "@/backend/db";
import { env } from "@/shared/env";
import { getIntegration } from "./oauth";
import type { IntegrationProvider } from "@prisma/client";

export async function refreshGoogleToken(
  workspaceId: string,
  provider: IntegrationProvider
): Promise<string | null> {
  const integration = await getIntegration(workspaceId, provider);
  if (!integration) return null;

  if (integration.expiresAt && integration.expiresAt > new Date(Date.now() + 60_000)) {
    return integration.accessToken;
  }
  if (!integration.refreshToken) return integration.accessToken;
  if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) {
    return integration.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
    client_id: env.GSC_CLIENT_ID,
    client_secret: env.GSC_CLIENT_SECRET,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return integration.accessToken;
  const json = (await res.json()) as { access_token: string; expires_in?: number };

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: json.access_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
    },
  });
  return json.access_token;
}

// ------- Search Console -------

export type GSCSite = { siteUrl: string; permissionLevel: string };

export async function listGSCSites(workspaceId: string): Promise<GSCSite[]> {
  const token = await refreshGoogleToken(workspaceId, "GOOGLE_SEARCH_CONSOLE");
  if (!token) return [];

  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { siteEntry?: GSCSite[] };
  return json.siteEntry ?? [];
}

export type GSCQuery = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function querySearchAnalytics(
  workspaceId: string,
  siteUrl: string,
  opts: {
    startDate?: string;
    endDate?: string;
    dimensions?: Array<"query" | "page" | "country" | "device">;
    rowLimit?: number;
  } = {}
): Promise<GSCQuery[]> {
  const token = await refreshGoogleToken(workspaceId, "GOOGLE_SEARCH_CONSOLE");
  if (!token) return [];

  const today = new Date();
  const ago30 = new Date(today.getTime() - 30 * 86400_000);
  const body = {
    startDate: opts.startDate ?? ago30.toISOString().slice(0, 10),
    endDate: opts.endDate ?? today.toISOString().slice(0, 10),
    dimensions: opts.dimensions ?? ["query"],
    rowLimit: opts.rowLimit ?? 100,
  };

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { rows?: GSCQuery[] };
  return json.rows ?? [];
}

// ------- GA4 -------

export type GA4Property = { name: string; displayName: string };

export async function listGA4Properties(workspaceId: string): Promise<GA4Property[]> {
  const token = await refreshGoogleToken(workspaceId, "GOOGLE_ANALYTICS");
  if (!token) return [];

  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    accountSummaries?: Array<{ propertySummaries?: GA4Property[] }>;
  };
  return (
    json.accountSummaries?.flatMap((a) => a.propertySummaries ?? []) ?? []
  );
}

export type GA4ReportRow = {
  dimensions: string[];
  metrics: number[];
};

export async function runGA4Report(
  workspaceId: string,
  propertyId: string, // e.g. "properties/123456789"
  opts: {
    startDate?: string;
    endDate?: string;
    dimensions?: string[];
    metrics?: string[];
    limit?: number;
  } = {}
): Promise<GA4ReportRow[]> {
  const token = await refreshGoogleToken(workspaceId, "GOOGLE_ANALYTICS");
  if (!token) return [];

  const body = {
    dateRanges: [
      {
        startDate: opts.startDate ?? "30daysAgo",
        endDate: opts.endDate ?? "today",
      },
    ],
    dimensions: (opts.dimensions ?? ["pagePath"]).map((name) => ({ name })),
    metrics: (opts.metrics ?? ["sessions", "activeUsers", "conversions"]).map(
      (name) => ({ name })
    ),
    limit: String(opts.limit ?? 50),
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.warn("GA4 runReport failed:", res.status, text);
    return [];
  }
  const json = (await res.json()) as {
    rows?: Array<{
      dimensionValues: { value: string }[];
      metricValues: { value: string }[];
    }>;
  };
  return (
    json.rows?.map((r) => ({
      dimensions: r.dimensionValues.map((d) => d.value),
      metrics: r.metricValues.map((m) => Number(m.value ?? 0)),
    })) ?? []
  );
}

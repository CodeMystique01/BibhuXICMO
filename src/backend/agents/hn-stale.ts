import { prisma } from "@/backend/db";
import { parseHnMeta, type HNKind } from "@/shared/hn";

function normalizeSiteUrl(url: string | null | undefined): string {
  return (url ?? "").replace(/\/$/, "").toLowerCase();
}

/** Show/Ask posts from meta.hnKind or legacy title prefix. */
export function getHNPostKind(
  meta: unknown,
  title: string | null | undefined
): HNKind | null {
  const k = parseHnMeta(meta)?.hnKind;
  if (k === "show_hn" || k === "ask_hn") return k;
  const t = title ?? "";
  if (/^show\s+hn\s*:/i.test(t)) return "show_hn";
  if (/^ask\s+hn\s*:/i.test(t)) return "ask_hn";
  return null;
}

/**
 * Reject pending Show/Ask HN drafts for a different site (or legacy drafts with no source tag).
 */
export async function invalidateStaleHNDrafts(
  workspaceId: string,
  websiteUrl: string | null
): Promise<number> {
  const normalized = normalizeSiteUrl(websiteUrl);

  const pending = await prisma.contentDraft.findMany({
    where: {
      workspaceId,
      agent: "hn",
      channel: "HACKER_NEWS",
      status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
    },
    select: { id: true, meta: true, title: true },
  });

  let count = 0;
  for (const d of pending) {
    if (!getHNPostKind(d.meta, d.title)) continue;

    const source = normalizeSiteUrl(
      String((d.meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? "")
    );

    // Legacy drafts (no source tag) are stale once a website URL is set
    const isCurrentSite = source && source === normalized;
    if (isCurrentSite) continue;

    await prisma.contentDraft.update({
      where: { id: d.id },
      data: { status: "REJECTED" },
    });
    count++;
  }
  return count;
}

export function hnDraftSourceMeta(websiteUrl: string | null) {
  return { sourceWebsiteUrl: normalizeSiteUrl(websiteUrl) || (websiteUrl ?? "") };
}

export function postDraftMatchesSite(
  meta: unknown,
  title: string | null | undefined,
  websiteUrl: string | null
): boolean {
  if (!getHNPostKind(meta, title)) return false;
  const siteKey = normalizeSiteUrl(websiteUrl);
  if (!siteKey) return false;

  const source = normalizeSiteUrl(
    String((meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? "")
  );
  if (!source) return false;
  return source === siteKey;
}

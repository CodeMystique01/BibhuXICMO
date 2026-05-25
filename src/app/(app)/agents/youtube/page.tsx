import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { env } from "@/shared/env";
import { CreatorSearch, type YTCreatorView } from "./creator-search";

export const metadata = { title: "YouTube Creator Search — Xicmo" };
/** Apify discovery runs are async (polled), but the initial page load is cheap. */
export const dynamic = "force-dynamic";

export default async function YouTubeAgentPage() {
  const { workspace } = await requireWorkspace();

  let rows: Array<{
    id: string;
    channelId: string;
    handle: string | null;
    title: string;
    description: string | null;
    subscribers: number;
    videoCount: number | null;
    viewCount: bigint | null;
    country: string | null;
    language: string | null;
    category: string | null;
    email: string | null;
    thumbnailUrl: string | null;
    channelUrl: string;
    isVerified: boolean;
    isCreator: boolean;
    qualityScore: number | null;
    detectionNote: string | null;
    lastContactAt: Date | null;
  }> = [];
  try {
    rows = await prisma.yTCreator.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [
        { isCreator: "desc" },
        { qualityScore: "desc" },
        { subscribers: "desc" },
      ],
      take: 200,
    });
  } catch (err) {
    // Migration not yet run on Render → render empty table without crashing.
    const code = (err as { code?: string })?.code;
    if (code !== "P2021") throw err;
  }

  const creators: YTCreatorView[] = rows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    handle: r.handle,
    title: r.title,
    description: r.description,
    subscribers: r.subscribers,
    videoCount: r.videoCount,
    viewCount: r.viewCount !== null ? r.viewCount.toString() : null,
    country: r.country,
    language: r.language,
    category: r.category,
    email: r.email,
    thumbnailUrl: r.thumbnailUrl,
    channelUrl: r.channelUrl,
    isVerified: r.isVerified,
    isCreator: r.isCreator,
    qualityScore: r.qualityScore,
    detectionNote: r.detectionNote,
    lastContactAt: r.lastContactAt,
  }));

  const hasApifyToken = Boolean(env.APIFY_YT_TOKEN || env.APIFY_TOKEN);

  return (
    <div className="container mx-auto max-w-6xl py-6">
      <CreatorSearch initialCreators={creators} hasApifyToken={hasApifyToken} />
    </div>
  );
}

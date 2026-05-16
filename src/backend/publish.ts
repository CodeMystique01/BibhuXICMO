import { prisma } from "@/backend/db";
import { submitRedditReply } from "@/integrations/reddit";
import { postTweet, postThread } from "@/integrations/twitter";
import { postToLinkedIn } from "@/integrations/linkedin";
import { ContentStatus } from "@prisma/client";

export async function publishDraft(
  workspaceId: string,
  draftId: string
): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId },
  });
  if (!draft) return { ok: false, error: "Draft not found" };

  try {
    let externalUrl: string | undefined;
    const meta = (draft.meta ?? {}) as Record<string, unknown>;

    switch (draft.channel) {
      case "REDDIT": {
        const parentFullname = String(meta.parentFullname ?? "");
        if (!parentFullname) throw new Error("Missing parentFullname on Reddit draft");
        const res = await submitRedditReply(workspaceId, parentFullname, draft.body);
        externalUrl = res?.url;
        break;
      }
      case "X": {
        const mode = meta.mode as string | undefined;
        const tweets = (meta.tweets as string[] | undefined) ?? [draft.body];
        if (mode === "thread" && tweets.length > 1) {
          const res = await postThread(workspaceId, tweets);
          externalUrl = res?.urls[0];
        } else {
          const res = await postTweet(workspaceId, tweets[0]);
          externalUrl = res?.url;
        }
        break;
      }
      case "LINKEDIN": {
        const res = await postToLinkedIn(workspaceId, draft.body);
        externalUrl = res?.url;
        break;
      }
      case "HACKER_NEWS":
        return {
          ok: false,
          error:
            "Hacker News has no official posting API. Open the thread and post the comment manually.",
        };
      case "BLOG":
      case "LANDING_PAGE":
      case "NEWSLETTER":
        // Mark as published in-app; exporting to external CMS is up to the user.
        externalUrl = undefined;
        break;
    }

    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        externalUrl,
      },
    });

    return { ok: true, url: externalUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: { status: ContentStatus.FAILED },
    });
    return { ok: false, error: message };
  }
}

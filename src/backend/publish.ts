import { prisma } from "@/backend/db";
import { submitRedditReply } from "@/integrations/reddit";
import { postTweet, postThread } from "@/integrations/twitter";
import { postToLinkedIn } from "@/integrations/linkedin";
import { ContentStatus } from "@prisma/client";

function buildHNClipboard(
  title: string | null,
  body: string,
  postUrl?: string
): string {
  const parts = [title, postUrl, body].filter(Boolean);
  return parts.join("\n\n");
}

export async function publishDraft(
  workspaceId: string,
  draftId: string
): Promise<
  | { ok: true; url?: string; assisted?: boolean; clipboard?: string }
  | { ok: false; error: string }
> {
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
      case "HACKER_NEWS": {
        const hnKind = meta.hnKind as string | undefined;
        const itemUrl = meta.itemUrl as string | undefined;
        const postUrl = meta.postUrl as string | undefined;
        if (hnKind === "comment" && itemUrl) {
          externalUrl = itemUrl;
        } else {
          externalUrl = "https://news.ycombinator.com/submit";
        }
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            externalUrl,
            meta: {
              ...meta,
              publishMode: "assisted",
              assistedNote:
                hnKind === "comment"
                  ? "Copy the comment and paste it on the HN thread."
                  : "Copy title/body and submit at news.ycombinator.com/submit",
              postUrl,
            },
          },
        });
        return {
          ok: true,
          url: externalUrl,
          assisted: true as const,
          clipboard: buildHNClipboard(draft.title, draft.body, postUrl),
        };
      }
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

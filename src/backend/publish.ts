import { prisma } from "@/backend/db";
import { submitRedditReply } from "@/integrations/reddit";
import { postTweet, postThread } from "@/integrations/twitter";
import { postToLinkedIn } from "@/integrations/linkedin";
import {
  publishImagePost,
  publishReel,
  publishStory,
  replyToComment,
  resolveIgBusinessAccount,
  InstagramNotConnectedError,
} from "@/integrations/instagram";
import {
  apifySendDM,
  IGCookiesExpiredError,
} from "@/integrations/instagram-apify-dm";
import { hasIGCookies, loadIGCookies } from "@/backend/ig-cookies";
import { buildIGClipboard, parseIgMeta } from "@/shared/instagram";
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
        const xKind = meta.xKind as string | undefined;
        const mode = meta.mode as string | undefined;
        const tweets = (meta.tweets as string[] | undefined) ?? [draft.body];
        const parentTweetId = meta.parentTweetId as string | undefined;
        if (xKind === "reply" && parentTweetId) {
          const res = await postTweet(workspaceId, tweets[0], { replyTo: parentTweetId });
          externalUrl = res?.url;
        } else if ((xKind === "thread" || mode === "thread") && tweets.length > 1) {
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
      case "INSTAGRAM": {
        const ig = parseIgMeta(meta);
        const igKind = ig?.igKind;
        const mediaUrl = ig?.mediaUrl;

        // Cold comments on others' posts can't be auto-published — assisted only.
        if (meta.assistedOnly === true) {
          await prisma.contentDraft.update({
            where: { id: draft.id },
            data: {
              status: ContentStatus.PUBLISHED,
              publishedAt: new Date(),
              externalUrl: (meta.permalink as string | undefined) ?? undefined,
              meta: {
                ...meta,
                publishMode: "assisted",
                assistedNote:
                  "Copy the comment and paste it directly on the Instagram post.",
              },
            },
          });
          return {
            ok: true,
            url: (meta.permalink as string | undefined) ?? undefined,
            assisted: true,
            clipboard: ig ? buildIGClipboard(ig, draft.body) : draft.body,
          };
        }

        // DM paths require Apify cookies. Fall back to assisted copy.
        if (igKind === "dm_outreach" || igKind === "dm_negotiation") {
          if (!ig?.recipient) {
            throw new Error("Missing recipient on Instagram DM draft");
          }
          if (!(await hasIGCookies(workspaceId))) {
            return {
              ok: true,
              assisted: true,
              clipboard: draft.body,
            };
          }
          const cookies = await loadIGCookies(workspaceId);
          try {
            const res = await apifySendDM({
              cookies,
              recipient: ig.recipient,
              message: draft.body,
            });
            externalUrl = `https://www.instagram.com/${ig.recipient}/`;
            // Update negotiation state on first DM send.
            if (ig.negotiationId) {
              await prisma.iGNegotiation
                .update({
                  where: { id: ig.negotiationId },
                  data: {
                    status: igKind === "dm_outreach" ? "DM_SENT" : "NEGOTIATING",
                    lastMessageAt: new Date(),
                  },
                })
                .catch(() => null);
            }
            // Best-effort creator lastDmAt
            await prisma.iGCreator
              .updateMany({
                where: { workspaceId, handle: ig.recipient },
                data: { lastDmAt: new Date() },
              })
              .catch(() => null);
            // Attach the resulting thread id for future polling.
            if (res.threadId) {
              await prisma.contentDraft.update({
                where: { id: draft.id },
                data: {
                  meta: {
                    ...meta,
                    threadId: res.threadId,
                  },
                },
              });
            }
            break;
          } catch (err) {
            if (err instanceof IGCookiesExpiredError) {
              // Pause all open negotiations for this workspace and notify.
              await prisma.iGNegotiation
                .updateMany({
                  where: {
                    workspaceId,
                    autopilot: true,
                    status: { in: ["DM_SENT", "NEGOTIATING", "REPLIED"] },
                  },
                  data: { autopilot: false },
                })
                .catch(() => null);
              await prisma.actionItem.create({
                data: {
                  workspaceId,
                  agent: "instagram",
                  type: "instagram.cookies_expired",
                  title: "IG cookies expired — DM autopilot paused",
                  summary:
                    "Re-add IG session cookies on /agents/instagram to resume sending.",
                  cta: "Fix cookies",
                  href: "/agents/instagram",
                  priority: "HIGH",
                },
              });
              throw new Error(
                "Instagram cookies expired — autopilot paused. Re-add them under /agents/instagram."
              );
            }
            throw err;
          }
        }

        // Comment reply on user's own posts → Graph API
        if (igKind === "comment_reply" && ig?.commentId) {
          try {
            const res = await replyToComment(
              workspaceId,
              ig.commentId,
              draft.body
            );
            externalUrl = (meta.permalink as string | undefined) ?? undefined;
            if (res?.id) {
              await prisma.contentDraft.update({
                where: { id: draft.id },
                data: {
                  meta: { ...meta, externalCommentId: res.id },
                },
              });
            }
            break;
          } catch (err) {
            if (err instanceof InstagramNotConnectedError) {
              return {
                ok: true,
                assisted: true,
                clipboard: draft.body,
              };
            }
            throw err;
          }
        }

        // post / reel / story → Graph API (needs imageUrl)
        if (igKind === "post" || igKind === "reel" || igKind === "story") {
          const acc = await resolveIgBusinessAccount(workspaceId);
          if (!acc) {
            return {
              ok: true,
              assisted: true,
              clipboard: ig ? buildIGClipboard(ig, draft.body) : draft.body,
            };
          }
          if (!mediaUrl) {
            // Mark as published-assisted: user must upload the visual manually.
            await prisma.contentDraft.update({
              where: { id: draft.id },
              data: {
                status: ContentStatus.PUBLISHED,
                publishedAt: new Date(),
                meta: {
                  ...meta,
                  publishMode: "assisted",
                  assistedNote:
                    "No mediaUrl on draft — open Instagram, upload your visual, and paste this caption.",
                },
              },
            });
            return {
              ok: true,
              assisted: true,
              clipboard: ig ? buildIGClipboard(ig, draft.body) : draft.body,
            };
          }
          try {
            const caption = ig ? buildIGClipboard(ig, draft.body) : draft.body;
            if (igKind === "post") {
              const res = await publishImagePost(workspaceId, mediaUrl, caption);
              externalUrl = res?.permalink ?? undefined;
            } else if (igKind === "reel") {
              const res = await publishReel(workspaceId, mediaUrl, caption);
              externalUrl =
                res && "permalink" in res ? res.permalink : undefined;
            } else {
              await publishStory(workspaceId, mediaUrl);
            }
            break;
          } catch (err) {
            if (err instanceof InstagramNotConnectedError) {
              return {
                ok: true,
                assisted: true,
                clipboard: ig ? buildIGClipboard(ig, draft.body) : draft.body,
              };
            }
            throw err;
          }
        }

        // Unknown IG kind → assisted fallback.
        return {
          ok: true,
          assisted: true,
          clipboard: ig ? buildIGClipboard(ig, draft.body) : draft.body,
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

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, ExternalLink, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  regenerateHNBodyAction,
  regenerateHNFullAction,
  regenerateHNTitleAction,
  scheduleHNPeakAction,
} from "./hn-actions";
import { HN_SUBMIT_URL, hnKindLabel, type HNDraftMeta } from "@/shared/hn";

export function HNDraftActions({
  draftId,
  meta,
  title,
  body,
}: {
  draftId: string;
  meta: HNDraftMeta;
  title: string | null;
  body: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const openUrl =
    meta.hnKind === "comment" && meta.itemUrl
      ? meta.itemUrl
      : HN_SUBMIT_URL;

  const clipboardText = [title, meta.postUrl, body].filter(Boolean).join("\n\n");

  return (
    <div className="flex flex-wrap gap-2 border-b pb-4">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await regenerateHNTitleAction(draftId);
            if (res.ok) {
              toast.success("Title regenerated");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        <RefreshCw className="h-4 w-4" />
        Regenerate title
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await regenerateHNBodyAction(draftId);
            if (res.ok) {
              toast.success("Body regenerated");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        <RefreshCw className="h-4 w-4" />
        Regenerate body
      </Button>
      {(meta.hnKind === "show_hn" || meta.hnKind === "ask_hn") && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await regenerateHNFullAction(draftId);
              if (res.ok) {
                toast.success("Post regenerated");
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <RefreshCw className="h-4 w-4" />
          Rewrite post
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(clipboardText);
            toast.success("Copied to clipboard");
          } catch {
            toast.error("Could not copy — select text manually");
          }
        }}
      >
        <Copy className="h-4 w-4" />
        Copy for HN
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={openUrl} target="_blank" rel="noreferrer noopener">
          <ExternalLink className="h-4 w-4" />
          Open on HN
        </a>
      </Button>
      {(meta.hnKind === "show_hn" || meta.hnKind === "ask_hn") && (
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await scheduleHNPeakAction(draftId);
              if (res.ok) {
                toast.success("Scheduled for peak window (~10 AM PT)", {
                  description: new Date(res.scheduledAt).toLocaleString(),
                });
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <Clock className="h-4 w-4" />
          Schedule peak
        </Button>
      )}
      <span className="self-center text-xs text-muted-foreground">
        {hnKindLabel(meta.hnKind)}
      </span>
    </div>
  );
}

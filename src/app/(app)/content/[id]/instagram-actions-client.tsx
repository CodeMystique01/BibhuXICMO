"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  buildIGClipboard,
  igKindLabel,
  isIGContentKind,
  type IGDraftMeta,
} from "@/shared/instagram";
import {
  regenerateIGDraftAction,
  scheduleIGPeakAction,
} from "./instagram-actions";

export function InstagramDraftActions({
  draftId,
  meta,
  body,
}: {
  draftId: string;
  meta: IGDraftMeta;
  body: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const clipboardText = buildIGClipboard(meta, body);
  const openUrl =
    meta.igKind === "comment_reply" && (meta as { permalink?: string }).permalink
      ? (meta as unknown as { permalink: string }).permalink
      : "https://www.instagram.com/";

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await regenerateIGDraftAction(draftId);
              if (res.ok) {
                toast.success("Draft regenerated");
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <RefreshCw className="h-4 w-4" />
          Regenerate
        </Button>
        <Button
          size="sm"
          variant="outline"
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
          Copy for Instagram
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={openUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="h-4 w-4" />
            Open Instagram
          </a>
        </Button>
        {isIGContentKind(meta.igKind) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const res = await scheduleIGPeakAction(draftId);
                if (res.ok) {
                  toast.success("Scheduled for peak window (~11 AM ET)", {
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
          {igKindLabel(meta.igKind)}
        </span>
      </div>

      {meta.visualPrompt ? (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium uppercase tracking-wide text-[10px]">
            Visual prompt
          </div>
          {meta.visualPrompt}
        </div>
      ) : null}

      {meta.hashtags && meta.hashtags.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {meta.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

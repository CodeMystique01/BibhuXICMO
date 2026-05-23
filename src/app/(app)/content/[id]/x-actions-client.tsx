"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { buildXClipboard, xKindLabel, type XDraftMeta } from "@/shared/x";
import { regenerateXDraftAction, scheduleXPeakAction } from "./x-actions";

export function XDraftActions({
  draftId,
  meta,
  body,
}: {
  draftId: string;
  meta: XDraftMeta;
  body: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const clipboardText = buildXClipboard(meta, body);
  const openUrl =
    meta.xKind === "reply" && meta.parentUrl
      ? meta.parentUrl
      : "https://x.com/compose/tweet";

  return (
    <div className="flex flex-wrap gap-2 border-b pb-4">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await regenerateXDraftAction(draftId);
            if (res.ok) {
              toast.success("Draft regenerated");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        <RefreshCw className="h-4 w-4" />
        {meta.xKind === "thread" ? "Regenerate thread" : "Regenerate"}
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
        Copy for X
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={openUrl} target="_blank" rel="noreferrer noopener">
          <ExternalLink className="h-4 w-4" />
          {meta.xKind === "reply" ? "Open tweet" : "Open X"}
        </a>
      </Button>
      {(meta.xKind === "single" || meta.xKind === "thread") && (
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await scheduleXPeakAction(draftId);
              if (res.ok) {
                toast.success("Scheduled for peak window (~9 AM ET)", {
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
        {xKindLabel(meta.xKind)}
      </span>
    </div>
  );
}

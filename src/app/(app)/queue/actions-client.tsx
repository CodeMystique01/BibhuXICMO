"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Send } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { publishDraftAction, rejectDraftAction } from "./actions";
import type { ContentChannel } from "@prisma/client";

export function QueueActions({
  id,
  channel,
}: {
  id: string;
  channel: ContentChannel;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await publishDraftAction(id);
            if (res.ok) {
              toast.success(
                res.url ? "Published ↗" : "Marked as published"
              );
            } else {
              toast.error("Publish failed", { description: res.error });
            }
            router.refresh();
          })
        }
      >
        <Send className="h-4 w-4" />
        {channel === "BLOG" || channel === "LANDING_PAGE"
          ? "Mark published"
          : "Publish"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await rejectDraftAction(id);
            toast("Rejected");
            router.refresh();
          })
        }
      >
        <X className="h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}

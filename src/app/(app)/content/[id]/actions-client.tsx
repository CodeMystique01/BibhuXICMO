"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { updateDraftStatus } from "./actions";

export function DraftActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "PUBLISHED" && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await updateDraftStatus(id, "PUBLISHED");
              toast.success("Marked as published");
              router.refresh();
            })
          }
        >
          <Check className="h-4 w-4" />
          Mark as published
        </Button>
      )}
      {status !== "REJECTED" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await updateDraftStatus(id, "REJECTED");
              toast("Rejected");
              router.refresh();
            })
          }
        >
          <Trash2 className="h-4 w-4" />
          Reject
        </Button>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, Power, Zap } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  toggleIGCampaignAutopilotAction,
  updateIGCampaignStatusAction,
} from "./actions";

type Props = {
  campaignId: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";
  autopilot: boolean;
};

export function CampaignControls({ campaignId, status, autopilot }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function update(
    next: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED",
    label: string
  ) {
    startTransition(async () => {
      const res = await updateIGCampaignStatusAction(campaignId, next);
      if (res.ok) {
        toast.success(label);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "ACTIVE" && (
        <Button size="sm" disabled={isPending} onClick={() => update("ACTIVE", "Campaign activated")}>
          <Play className="h-4 w-4" />
          Activate
        </Button>
      )}
      {status === "ACTIVE" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => update("PAUSED", "Campaign paused")}
        >
          <Pause className="h-4 w-4" />
          Pause
        </Button>
      )}
      {status !== "CLOSED" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => update("CLOSED", "Campaign closed")}
        >
          <Power className="h-4 w-4" />
          Close
        </Button>
      )}
      <Button
        size="sm"
        variant={autopilot ? "secondary" : "outline"}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await toggleIGCampaignAutopilotAction(
              campaignId,
              !autopilot
            );
            if (res.ok) {
              toast.success(autopilot ? "Autopilot off" : "Autopilot on");
              router.refresh();
            }
          })
        }
      >
        <Zap className="h-4 w-4" />
        Autopilot: {autopilot ? "On" : "Off"}
      </Button>
    </div>
  );
}

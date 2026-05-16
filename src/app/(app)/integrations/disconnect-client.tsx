"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { disconnectIntegration } from "./actions";
import type { IntegrationProvider } from "@prisma/client";

export function DisconnectButton({ provider }: { provider: IntegrationProvider }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await disconnectIntegration(provider);
          toast("Disconnected");
          router.refresh();
        })
      }
    >
      {isPending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import { Label } from "@/frontend/components/ui/label";
import {
  clearIGCookiesAction,
  saveIGCookiesAction,
} from "./actions";

export function IGCookiesModal({ hasCookies }: { hasCookies: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cookies, setCookies] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasCookies ? "outline" : "secondary"} size="sm">
          <KeyRound className="h-4 w-4" />
          {hasCookies ? "Update IG cookies" : "Add IG cookies"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Instagram session cookies — required for DM autopilot</DialogTitle>
          <DialogDescription>
            DMs go through the Apify DM-automation actor, which signs into
            Instagram as your account. Cookies are encrypted with your
            workspace key and never stored in plaintext.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="space-y-1">
              <div className="font-medium text-destructive">
                Read this before continuing
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive/90">
                <li>
                  Bulk DM automation may violate Instagram&apos;s Terms of
                  Service. Your account can be rate-limited or banned.
                </li>
                <li>
                  Cookies expire — when they do, the autopilot pauses
                  automatically and you&apos;ll get a notification.
                </li>
                <li>
                  Use a dedicated IG Business account, never your personal one.
                </li>
                <li>
                  Daily cap: 20 first-DMs per workspace per 24h (hard-coded).
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cookies">Cookie payload (JSON or sessionid)</Label>
          <textarea
            id="cookies"
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            placeholder='{"sessionid":"...","csrftoken":"...","ds_user_id":"..."}'
          />
          <p className="text-xs text-muted-foreground">
            Export from your IG Business account using a browser cookie tool, or
            paste just the `sessionid` value if your actor accepts it.
          </p>
        </div>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I understand DM automation may violate Instagram&apos;s ToS and
            could result in account restrictions. I&apos;m using a dedicated
            account, not my personal one.
          </span>
        </label>

        <DialogFooter className="gap-2">
          {hasCookies && (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await clearIGCookiesAction();
                  if (res.ok) {
                    toast.success("Cookies cleared");
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              <Trash2 className="h-4 w-4" />
              Clear stored cookies
            </Button>
          )}
          <Button
            disabled={isPending || !acknowledged || !cookies.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await saveIGCookiesAction(cookies);
                if (res.ok) {
                  toast.success("Cookies saved (encrypted)");
                  setCookies("");
                  setAcknowledged(false);
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(res.error);
                }
              })
            }
          >
            <KeyRound className="h-4 w-4" />
            Save cookies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

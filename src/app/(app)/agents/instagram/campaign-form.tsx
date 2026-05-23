"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { createIGCampaignAction } from "./actions";

export function CampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    brand: "",
    budgetMin: 100,
    budgetMax: 500,
    brief: "",
    autopilot: false,
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New campaign
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New outreach campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createIGCampaignAction(form);
              if (res.ok) {
                toast.success("Campaign created");
                setForm({
                  name: "",
                  brand: "",
                  budgetMin: 100,
                  budgetMax: 500,
                  brief: "",
                  autopilot: false,
                });
                setOpen(false);
                router.refresh();
              } else {
                toast.error(res.error);
              }
            });
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <div>
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              required
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="budgetMin">Budget min ($)</Label>
            <Input
              id="budgetMin"
              type="number"
              min={0}
              value={form.budgetMin}
              onChange={(e) =>
                setForm({ ...form, budgetMin: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label htmlFor="budgetMax">Budget max ($)</Label>
            <Input
              id="budgetMax"
              type="number"
              min={0}
              value={form.budgetMax}
              onChange={(e) =>
                setForm({ ...form, budgetMax: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="brief">Brief (what creators should know)</Label>
            <textarea
              id="brief"
              rows={3}
              value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs md:col-span-2">
            <input
              type="checkbox"
              checked={form.autopilot}
              onChange={(e) =>
                setForm({ ...form, autopilot: e.target.checked })
              }
            />
            Enable AI negotiation autopilot for new prospects (requires IG cookies)
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Create campaign"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

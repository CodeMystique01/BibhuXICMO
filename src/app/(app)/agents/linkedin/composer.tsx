"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { runAgentAction } from "@/app/(app)/agents/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";

export function LinkedInComposer() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!topic.trim()) return;
            startTransition(async () => {
              const res = await runAgentAction("linkedin", { topic, angle });
              if (res.ok) {
                toast.success("Draft created");
                setTopic("");
                setAngle("");
                router.refresh();
              } else {
                toast.error("Could not generate", { description: res.error });
              }
            });
          }}
          className="grid gap-3 md:grid-cols-[2fr_2fr_auto]"
        >
          <div>
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should the post be about?"
              required
            />
          </div>
          <div>
            <Label htmlFor="angle">Angle</Label>
            <Input
              id="angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Draft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

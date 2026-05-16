"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { runAgentAction } from "../actions";

type Channel = "blog" | "landing_page" | "x" | "linkedin";

export function ContentWriterForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [channel, setChannel] = useState<Channel>("blog");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!topic.trim()) return;
        startTransition(async () => {
          const res = await runAgentAction("content", {
            topic,
            angle,
            channel,
          });
          if (res.ok) {
            toast.success("Draft created");
            router.refresh();
            setTopic("");
            setAngle("");
          } else {
            toast.error("Could not generate", { description: res.error });
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="channel">Channel</Label>
        <select
          id="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="blog">Blog post</option>
          <option value="landing_page">Landing page</option>
          <option value="x">X (Twitter) thread</option>
          <option value="linkedin">LinkedIn post</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. How we use AI to find Reddit threads"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="angle">Angle (optional)</Label>
        <Input
          id="angle"
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          placeholder="e.g. Practical tactics with real examples"
        />
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Writing…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate draft
          </>
        )}
      </Button>
    </form>
  );
}

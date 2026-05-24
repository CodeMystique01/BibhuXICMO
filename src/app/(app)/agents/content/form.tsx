"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Image as ImageIcon,
  List,
  Loader2,
  Pencil,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { runAgentAction, runContentBulkAction } from "../actions";

type Channel = "blog" | "landing_page" | "x" | "linkedin";
type Mode = "single" | "bulk";
type BlogType = "listicle" | "descriptive";

export function ContentWriterForm({
  geminiAvailable,
}: {
  geminiAvailable: boolean;
}) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border bg-card p-1">
        <ModeTab
          active={mode === "single"}
          onClick={() => setMode("single")}
          icon={Pencil}
          label="Single topic"
        />
        <ModeTab
          active={mode === "bulk"}
          onClick={() => setMode("bulk")}
          icon={List}
          label="Bulk keywords"
        />
      </div>

      {mode === "single" ? (
        <SingleForm />
      ) : (
        <BulkForm geminiAvailable={geminiAvailable} />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Single topic — original UX preserved.
// ---------------------------------------------------------------------------

function SingleForm() {
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
          const res = await runAgentAction("content", { topic, angle, channel });
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

// ---------------------------------------------------------------------------
//  Bulk keywords — new flow.
// ---------------------------------------------------------------------------

function BulkForm({ geminiAvailable }: { geminiAvailable: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [blogType, setBlogType] = useState<BlogType>("listicle");
  const [includeImage, setIncludeImage] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<
    { id: string; title: string; keyword: string }[] | null
  >(null);

  const keywords = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((k) => k.trim())
        .filter(Boolean),
    [text]
  );

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      // Support .csv (first column) or .txt (one per line)
      const cleaned = raw
        .split(/\r?\n/)
        .map((row) => row.split(",")[0]?.trim() ?? "")
        .filter(Boolean);
      setText(cleaned.join("\n"));
    };
    reader.readAsText(file);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (keywords.length === 0) return;
    setDone(null);
    startTransition(async () => {
      toast.info(
        `Generating ${keywords.length} draft${keywords.length === 1 ? "" : "s"}…`,
        {
          description: `Each draft takes 15-25s (image: +10s). Stay on the page.`,
        }
      );
      const res = await runContentBulkAction({
        keywords,
        blogType,
        includeImage: includeImage && geminiAvailable,
      });
      if (res.ok) {
        toast.success(
          `Created ${res.created.length} draft${res.created.length === 1 ? "" : "s"}`
        );
        setDone(res.created);
        setText("");
        router.refresh();
      } else {
        toast.error("Batch failed", { description: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center justify-between">
          <span>Keywords (one per line)</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {keywords.length} keyword{keywords.length === 1 ? "" : "s"} · max 20
          </span>
        </Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "best ai writing tools\nfree seo tools\nreddit marketing strategies"
          }
          rows={6}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          <Upload className="h-3 w-3" />
          Upload .txt / .csv (first column)
          <input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </label>
      </div>

      <div className="space-y-2">
        <Label>Blog type</Label>
        <div className="grid grid-cols-2 gap-2">
          <BlogTypeCard
            active={blogType === "listicle"}
            onClick={() => setBlogType("listicle")}
            title="Listicle"
            body="Ranked round-up. Each item linked to its brand."
          />
          <BlogTypeCard
            active={blogType === "descriptive"}
            onClick={() => setBlogType("descriptive")}
            title="Descriptive"
            body="Long-form explainer with inline citations."
          />
        </div>
      </div>

      <div>
        <label
          className={
            "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-xs transition-colors " +
            (includeImage && geminiAvailable
              ? "border-primary/50 bg-primary/5"
              : "border-input")
          }
        >
          <input
            type="checkbox"
            checked={includeImage && geminiAvailable}
            disabled={!geminiAvailable}
            onChange={(e) => setIncludeImage(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              Generate hero image (Gemini)
            </div>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {geminiAvailable ? (
                <>
                  Adds a 16:9 hero plus per-item images for listicles (one per item)
                  or 2-3 section images for descriptive blogs. Generated in
                  parallel via Gemini — adds ~30-60s per keyword.
                </>
              ) : (
                <>
                  Set <code className="rounded bg-muted px-1">GOOGLE_GEMINI_API_KEY</code> in
                  Render env vars to enable image generation.
                </>
              )}
            </p>
          </div>
        </label>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isPending || keywords.length === 0}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Drafting {keywords.length} blog{keywords.length === 1 ? "" : "s"}…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate {keywords.length} draft{keywords.length === 1 ? "" : "s"}
          </>
        )}
      </Button>

      {done && done.length > 0 ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Batch complete · {done.length} draft{done.length === 1 ? "" : "s"} ready
          </div>
          <ul className="space-y-0.5">
            {done.map((d) => (
              <li key={d.id} className="truncate text-muted-foreground">
                <Badge variant="outline" className="mr-1.5 text-[10px]">
                  {d.keyword}
                </Badge>
                {d.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

function BlogTypeCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border p-3 text-left transition-colors " +
        (active
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
          : "hover:border-primary/30 hover:bg-muted/40")
      }
    >
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </button>
  );
}

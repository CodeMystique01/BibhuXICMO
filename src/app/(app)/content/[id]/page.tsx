import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { renderMarkdown } from "@/backend/content";
import { Badge } from "@/frontend/components/ui/badge";
import { parseHnMeta } from "@/shared/hn";
import { parseXMeta } from "@/shared/x";
import { parseIgMeta } from "@/shared/instagram";
import { DraftActions } from "./actions-client";
import { HNDraftActions } from "./hn-actions-client";
import { XDraftActions } from "./x-actions-client";
import { InstagramDraftActions } from "./instagram-actions-client";

export default async function DraftPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { workspace } = await requireWorkspace();
  const draft = await prisma.contentDraft.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!draft) notFound();

  const hnMeta =
    draft.channel === "HACKER_NEWS" ? parseHnMeta(draft.meta) : null;
  const xMeta = draft.channel === "X" ? parseXMeta(draft.meta) : null;
  const igMeta = draft.channel === "INSTAGRAM" ? parseIgMeta(draft.meta) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/content"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Content Library
      </Link>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="capitalize">
          {draft.channel.toLowerCase().replace("_", " ")}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {draft.status.toLowerCase().replace("_", " ")}
        </Badge>
        <span>· by {draft.agent}</span>
        <span>· {format(draft.createdAt, "MMM d, yyyy · HH:mm")}</span>
      </div>

      <h1 className="text-4xl font-semibold tracking-tight">
        {draft.title || "Untitled draft"}
      </h1>

      {hnMeta ? (
        <HNDraftActions
          draftId={draft.id}
          meta={hnMeta}
          title={draft.title}
          body={draft.body}
        />
      ) : null}

      {xMeta ? (
        <XDraftActions draftId={draft.id} meta={xMeta} body={draft.body} />
      ) : null}

      {igMeta ? (
        <InstagramDraftActions
          draftId={draft.id}
          meta={igMeta}
          body={draft.body}
        />
      ) : null}

      <DraftActions id={draft.id} status={draft.status} />

      <article
        className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-7 [&_h1]:mt-0 [&_h2]:mt-8 [&_h2]:text-2xl [&_h3]:mt-6 [&_p]:mb-4 [&_ul]:my-4 [&_ul]:pl-6 [&_ul]:list-disc [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }}
      />
    </div>
  );
}

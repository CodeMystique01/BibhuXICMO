"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AtSign,
  Building2,
  ChevronDown,
  Facebook,
  FileText,
  Github,
  Instagram,
  Linkedin,
  Megaphone,
  Plus,
  Target,
  Twitter,
  Users,
  Youtube,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import type { CmoFastData, CmoSlowData } from "@/backend/agents/cmo-data";

type CompanyData = CmoFastData &
  Partial<Pick<CmoSlowData, "liveSnapshot" | "llmAnalysis">>;

type Section = "product" | "competitors" | "voice" | "strategy";

const SECTIONS: Array<{ id: Section; label: string; icon: typeof FileText }> = [
  { id: "product", label: "Product information", icon: FileText },
  { id: "competitors", label: "Competitor analysis", icon: Users },
  { id: "voice", label: "Brand voice", icon: Megaphone },
  { id: "strategy", label: "Marketing strategy", icon: Target },
];

export function CompanyPanel({ data }: { data: CompanyData }) {
  const [open, setOpen] = useState<Section | null>(null);

  const description =
    data.liveSnapshot?.description?.trim() ||
    data.voice?.siteDescription?.trim() ||
    "Add your website and finish onboarding so agents can analyze your business.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" aria-hidden />
            Company
          </span>
          <Link
            href="/settings#websiteUrl"
            title="Change the site this dashboard tracks. We re-run audits, regenerate strategy, and refresh Ahrefs + PageSpeed automatically."
            aria-label="Switch or audit a new site"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add your handles so agents can learn your tone from public posts.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 text-sm">
        <SocialHandlesRow voice={data.voice ?? null} />

        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

        {data.voice?.positioning ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Positioning
            </div>
            {data.voice.positioning}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </div>
          {SECTIONS.map((s) => (
            <DocumentCard
              key={s.id}
              icon={s.icon}
              label={s.label}
              isOpen={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
            >
              <DocumentBody section={s.id} data={data} />
            </DocumentCard>
          ))}
        </div>

        {data.topCompetitors.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.topCompetitors.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentCard({
  icon: Icon,
  label,
  isOpen,
  onToggle,
  children,
}: {
  icon: typeof FileText;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
        aria-expanded={isOpen}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown
          className={
            "h-3.5 w-3.5 text-muted-foreground transition-transform " +
            (isOpen ? "rotate-180" : "")
          }
          aria-hidden
        />
      </button>
      {isOpen ? (
        <div className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DocumentBody({
  section,
  data,
}: {
  section: Section;
  data: CompanyData;
}) {
  const v = data.voice;
  switch (section) {
    case "product": {
      const desc =
        data.liveSnapshot?.description ||
        v?.siteDescription ||
        data.workspace.icp;
      const props = v?.valueProps ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      return (
        <div className="space-y-2">
          {data.workspace.industry ? (
            <p>
              <span className="font-medium text-foreground">Industry:</span>{" "}
              {data.workspace.industry}
            </p>
          ) : null}
          {desc ? <p>{desc}</p> : <p>No product description yet.</p>}
          {props.length > 0 ? (
            <ul className="ml-4 list-disc space-y-1">
              {props.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {enrich?.productBlurb ? (
            <div className="mt-2 rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI deep-dive:</span>{" "}
              {enrich.productBlurb}
            </div>
          ) : null}
        </div>
      );
    }
    case "competitors": {
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (!v?.competitors?.length && !enrich?.competitorAngles) {
        return (
          <div className="space-y-1.5">
            <p>No competitors recorded yet.</p>
            <p className="text-[11px] leading-relaxed">
              The strategy LLM could not return competitor analysis (most often
              this means the configured key has no billing credits). Add a
              working <code className="font-mono">ANTHROPIC_API_KEY</code> or
              <code className="font-mono"> OPENAI_API_KEY</code> with credits,
              then re-run the SEO agent.
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {v?.competitors?.length ? (
            <ul className="space-y-1">
              {v.competitors.slice(0, 12).map((c) => (
                <li key={c} className="rounded bg-muted/40 px-2 py-1 text-foreground">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
          {enrich?.competitorAngles ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI angle:</span>{" "}
              {enrich.competitorAngles}
            </p>
          ) : null}
        </div>
      );
    }
    case "voice": {
      const tone = v?.brandVoice?.tone ?? v?.tone;
      const style = v?.brandVoice?.style ?? v?.styleGuidelines?.join("; ");
      const avoidList = v?.brandVoice?.avoid ?? v?.avoid ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      return (
        <div className="space-y-2">
          {tone ? (
            <p>
              <span className="font-medium text-foreground">Tone:</span> {tone}
            </p>
          ) : null}
          {style ? (
            <p>
              <span className="font-medium text-foreground">Style:</span> {style}
            </p>
          ) : null}
          {avoidList.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Avoid:</span>
              <ul className="ml-4 list-disc">
                {avoidList.slice(0, 8).map((a) => (
                  <li key={typeof a === "string" ? a : String(a)}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.voiceSummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI summary:</span>{" "}
              {enrich.voiceSummary}
            </p>
          ) : null}
          {!tone && !style && avoidList.length === 0 && !enrich?.voiceSummary ? (
            <p>Brand voice profile not generated yet.</p>
          ) : null}
        </div>
      );
    }
    case "strategy": {
      const channels = v?.channels ?? [];
      const clusters = v?.topicClusters ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      return (
        <div className="space-y-2">
          {channels.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Channels:</span>{" "}
              {channels.join(", ")}
            </div>
          ) : null}
          {clusters.length > 0 ? (
            <div>
              <div className="font-medium text-foreground">Topic clusters</div>
              <ul className="ml-4 list-disc space-y-1">
                {clusters.slice(0, 5).map((c) => (
                  <li key={c.theme}>
                    <span className="text-foreground">{c.theme}</span>
                    {c.keywords?.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.keywords.slice(0, 5).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.strategySummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI playbook:</span>{" "}
              {enrich.strategySummary}
            </p>
          ) : null}
          {channels.length === 0 && clusters.length === 0 && !enrich?.strategySummary ? (
            <p>Run an SEO or onboarding pass to draft a strategy.</p>
          ) : null}
        </div>
      );
    }
  }
}


type CompanyVoice = (CompanyData["voice"]);

function SocialHandlesRow({ voice }: { voice: CompanyVoice | null }) {
  const handles = voice?.socialHandles ?? {};
  const items: Array<{
    key: keyof typeof handles;
    icon: typeof Twitter;
    label: string;
    href: (v: string) => string;
  }> = [
    {
      key: "twitter",
      icon: Twitter,
      label: "X",
      href: (v) => `https://x.com/${stripAt(v)}`,
    },
    {
      key: "instagram",
      icon: Instagram,
      label: "Instagram",
      href: (v) => `https://instagram.com/${stripAt(v)}`,
    },
    {
      key: "linkedin",
      icon: Linkedin,
      label: "LinkedIn",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "youtube",
      icon: Youtube,
      label: "YouTube",
      href: (v) => (v.startsWith("@") ? `https://youtube.com/${v}` : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "facebook",
      icon: Facebook,
      label: "Facebook",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "github",
      icon: Github,
      label: "GitHub",
      href: (v) => `https://github.com/${v.replace(/^@/, "")}`,
    },
  ];

  const present = items.filter((it) => {
    const v = handles[it.key];
    return typeof v === "string" && v.trim().length > 0;
  });

  if (present.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/settings" className="justify-start gap-2">
          <AtSign className="h-3.5 w-3.5" aria-hidden />
          Add social handles
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {present.map((it) => {
        const Icon = it.icon;
        const value = handles[it.key] as string;
        return (
          <a
            key={it.key}
            href={it.href(value)}
            target="_blank"
            rel="noreferrer noopener"
            title={`${it.label}: ${value}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="max-w-[10ch] truncate font-mono text-[11px]">
              {value}
            </span>
          </a>
        );
      })}
      <Link
        href="/settings"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Edit
      </Link>
    </div>
  );
}

function stripAt(v: string): string {
  return v.startsWith("@") ? v.slice(1) : v;
}

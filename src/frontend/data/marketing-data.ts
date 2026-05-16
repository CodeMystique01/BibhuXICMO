import type { LucideIcon } from "lucide-react";
import { SITE_NAME } from "@/shared/site";
import {
  BarChart3,
  Bot,
  Code2,
  FileText,
  Globe,
  Hash,
  Linkedin,
  MessageCircle,
  Newspaper,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

export type AgentCard = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  status?: "available" | "soon";
};

export const AGENTS: AgentCard[] = [
  {
    id: "reddit",
    name: "Reddit Agent",
    tagline: "Authentic community reach",
    description:
      "Finds relevant threads and drafts reply ideas and posts for you to review before publishing.",
    icon: MessageCircle,
    accent: "from-orange-500/20 to-red-500/10",
  },
  {
    id: "seo",
    name: "SEO Agent",
    tagline: "Search-first growth",
    description:
      "Suggests keyword opportunities and drafts blog posts and landing pages for your approval.",
    icon: Search,
    accent: "from-emerald-500/20 to-teal-500/10",
  },
  {
    id: "x",
    name: "X (Twitter) Agent",
    tagline: "On-brand social presence",
    description:
      "Generates post and thread drafts you can edit, refine, and post yourself.",
    icon: Hash,
    accent: "from-sky-500/20 to-blue-500/10",
  },
  {
    id: "linkedin",
    name: "LinkedIn Agent",
    tagline: "Professional positioning",
    description:
      "Suggests content ideas and drafts professional posts for you to personalise and share.",
    icon: Linkedin,
    accent: "from-blue-600/20 to-indigo-500/10",
  },
  {
    id: "hn",
    name: "Hacker News Agent",
    tagline: "Technical audiences",
    description:
      "Identifies the right moments to share and drafts comments for you to post.",
    icon: Newspaper,
    accent: "from-amber-500/20 to-orange-500/10",
  },
  {
    id: "geo",
    name: "GEO Agent",
    tagline: "AI Search Visibility",
    description:
      "Gets your brand cited in ChatGPT, Claude, Perplexity, and Google AI Overviews.",
    icon: Sparkles,
    accent: "from-purple-500/20 to-fuchsia-500/10",
  },
  {
    id: "gsc",
    name: "Google Search Console",
    tagline: "Your search data, actionable",
    description:
      "Uses search data to find ranking opportunities and pages needing a boost.",
    icon: TrendingUp,
    accent: "from-green-500/20 to-emerald-500/10",
  },
  {
    id: "ga4",
    name: "Google Analytics",
    tagline: "What's working, where to focus",
    description:
      "Connects to GA4 to surface what is working and where to focus next.",
    icon: BarChart3,
    accent: "from-yellow-500/20 to-amber-500/10",
  },
  {
    id: "coding",
    name: "Coding Agent",
    tagline: "Technical SEO, automated",
    description:
      "Automate technical SEO fixes and site improvements with our AI coding agent.",
    icon: Code2,
    accent: "from-slate-500/20 to-zinc-500/10",
  },
  {
    id: "content",
    name: "AI Content Writer",
    tagline: "Ship-ready long-form",
    description:
      "Drafts blog posts, landing pages, and long-form content in your brand voice.",
    icon: FileText,
    accent: "from-pink-500/20 to-rose-500/10",
  },
  {
    id: "link-broker",
    name: "Link Broker Agent",
    tagline: "Backlinks, handled",
    description:
      "Automated high-quality backlink building and management system.",
    icon: Globe,
    accent: "from-cyan-500/20 to-sky-500/10",
    status: "soon",
  },
  {
    id: "influencer",
    name: "Influencer Marketplace",
    tagline: "Creator partnerships",
    description:
      "Connect with the right influencers for your brand automatically.",
    icon: Users,
    accent: "from-violet-500/20 to-purple-500/10",
    status: "soon",
  },
  {
    id: "ugc",
    name: "UGC Content Agent",
    tagline: "User-generated content at scale",
    description:
      "Generate and manage User Generated Content at scale.",
    icon: Bot,
    accent: "from-rose-500/20 to-pink-500/10",
    status: "soon",
  },
];

export type Testimonial = {
  quote: string;
  author: string;
  handle: string;
};

/** MVP placeholders — replace quote / author / handle in this file when you have real testimonials. */
const PLACEHOLDER_TESTIMONIAL: Testimonial = {
  quote:
    "[Add a short customer quote here. Keep it specific and credible when you replace this.]",
  author: "—",
  handle: "—",
};

export const TESTIMONIALS: Testimonial[] = Array.from({ length: 12 }, () => ({
  ...PLACEHOLDER_TESTIMONIAL,
}));

export type CostRow = {
  label: string;
  without: string;
  withUs: string;
};

export const COST_COMPARISON: CostRow[] = [
  { label: "Full time marketing hire", without: "$5,000/mo", withUs: "included" },
  { label: "SEO agency", without: "$4,000/mo", withUs: "included" },
  { label: "Content writer", without: "$1,500/mo", withUs: "included" },
  { label: "Social media manager", without: "$1,500/mo", withUs: "included" },
  { label: "Reddit & community growth", without: "$1,000/mo", withUs: "included" },
  { label: "AI search visibility (GEO)", without: "not possible", withUs: "included" },
  { label: "24/7 availability", without: "not possible", withUs: "included" },
];

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: `What exactly does ${SITE_NAME} do for my business?`,
    a: "It functions as your entire marketing team: it analyzes your website, crafts a positioning strategy, finds relevant Reddit and Hacker News threads, writes blog posts and landing pages, optimizes for SEO and GEO (AI search), manages X/LinkedIn presence, and surfaces the highest-leverage action items every day. You stay in control and approve anything before it publishes.",
  },
  {
    q: "How does the Growth Agent analyze my website?",
    a: "We crawl your site (headings, metadata, schema, copy, page speed signals), pair it with your Google Search Console and Google Analytics data when connected, and then use an LLM to produce a strategy document — industry, ICP, voice, positioning — that every other agent uses as its source of truth.",
  },
  {
    q: "What is the difference between Free and Max?",
    a: "Free includes website analysis, the initial strategy document, Hacker News Agent access, and a small credit allowance. Max ($99/mo) unlocks 2,000 credits (~20,000 messages), the full agent suite (SEO, GEO, Reddit, X, LinkedIn, Coding, GSC, GA4), and daily scheduled runs.",
  },
  {
    q: "How does the Reddit community growth feature work?",
    a: "Connect Reddit via OAuth; the agent monitors subreddits relevant to your ICP, ranks threads by relevance using embeddings, and drafts community-native replies. Nothing is posted automatically — every draft goes into an approval queue first.",
  },
  {
    q: "What SEO capabilities are included?",
    a: "Daily technical audits (broken links, missing meta, schema gaps, slow pages), keyword opportunity discovery, ranking tracking, and AI-generated drafts for blog posts and landing pages targeting those keywords.",
  },
  {
    q: "What is GEO (AI Search Visibility)?",
    a: "GEO = Generative Engine Optimization. We regularly query ChatGPT, Claude, Perplexity, and Google's AI Overviews with prompts relevant to your business, check whether your brand is cited, and compute a weekly GEO score so you can see trends and act on gaps.",
  },
  {
    q: "How long until I see results?",
    a: "Action items and drafts start appearing within minutes of onboarding. SEO and GEO improvements compound over weeks as Google and the LLM training data refresh. Most users report noticeable GSC and GEO movement within 2–4 weeks.",
  },
  {
    q: "Does the agent post content automatically?",
    a: "Only if you explicitly enable auto-publish per channel. By default, everything is draft-first: the agent fills an approval queue and you click publish.",
  },
  {
    q: "Can I cancel or change my plan anytime?",
    a: "Yes — manage your subscription from the billing page at any time. No contracts, no cancellation fees.",
  },
];

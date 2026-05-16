/**
 * Marketing / help markdown content — thin facade over {@link MarketingContentPipeline}.
 */
import {
  marketingContentPipeline,
  type ContentEntry,
} from "@/backend/pipelines/marketing-content.pipeline";

export type { ContentEntry };

export const getBlogPosts = () => marketingContentPipeline.getBlogPosts();
export const getChangelog = () => marketingContentPipeline.getChangelog();
export const getHelpArticles = () => marketingContentPipeline.getHelpArticles();
export const getEntry = marketingContentPipeline.getEntry.bind(marketingContentPipeline);
export const renderMarkdown = marketingContentPipeline.renderMarkdown.bind(marketingContentPipeline);

/**
 * Site crawl helpers — re-exported from {@link SiteScrapePipeline} for stable import paths.
 */
import { siteScrapePipeline } from "@/backend/pipelines/site-scrape.pipeline";

export { siteScrapePipeline, type PageSnapshot } from "@/backend/pipelines/site-scrape.pipeline";

export const fetchPage = (url: string) => siteScrapePipeline.fetchPage(url);
export const normalizeUrl = (input: string) => siteScrapePipeline.normalizeUrl(input);
export const parseHtml = (url: string, html: string, status: number) =>
  siteScrapePipeline.parseHtml(url, html, status);

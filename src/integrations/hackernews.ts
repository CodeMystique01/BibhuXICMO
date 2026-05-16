export type HNStory = {
  objectID: string;
  title: string;
  url?: string;
  points: number;
  num_comments: number;
  author: string;
  created_at: string;
  story_text?: string;
};

export async function searchHN(
  query: string,
  opts: { byDate?: boolean; tags?: string; limit?: number } = {}
): Promise<HNStory[]> {
  const endpoint = opts.byDate
    ? "https://hn.algolia.com/api/v1/search_by_date"
    : "https://hn.algolia.com/api/v1/search";

  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("tags", opts.tags ?? "story");
  url.searchParams.set("hitsPerPage", String(opts.limit ?? 20));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HN search failed: ${res.status}`);
  const json = (await res.json()) as { hits: HNStory[] };
  return json.hits ?? [];
}

export async function getHNFrontPage(limit = 30): Promise<HNStory[]> {
  const res = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`
  );
  if (!res.ok) throw new Error(`HN front page fetch failed: ${res.status}`);
  const json = (await res.json()) as { hits: HNStory[] };
  return json.hits ?? [];
}

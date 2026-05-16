// TODO: M5-508 - Build sitemap covering all 22,181 category URLs, 731 blog URLs,
// paginated category URLs, and static pages. Split into multiple sitemap files
// if total exceeds 50,000.

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
}

export async function buildSitemap(): Promise<SitemapEntry[]> {
  // TODO M5-508
  return [];
}

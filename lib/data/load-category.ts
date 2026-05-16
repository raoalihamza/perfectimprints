// TODO: M3-301 - Implement category page loader.
// Strategy: Sanity-first (curatedCategory or customCategory by slug), then JSON
// fallback from data/categories/[encoded-slug].json, then null (triggers 404).

export interface CategoryPageData {
  source: 'sanity' | 'json';
  url: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  introHtml: string;
  faqs: Array<{ q: string; a: string }>;
  heroAltText: string;
  productSkus: string[];
}

export async function loadCategory(_url: string): Promise<CategoryPageData | null> {
  // TODO M3-301
  return null;
}

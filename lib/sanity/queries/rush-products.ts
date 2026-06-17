import { client } from '@/lib/sanity/client';

export interface RushProductsPageCopy {
  heading?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  hiddenRushSkus?: string[];
  pinnedRushSkus?: string[];
}

const RUSH_PRODUCTS_COPY_QUERY = `*[_type == "globalSettings"][0].rushProductsPage{
  heading,
  intro,
  metaTitle,
  metaDescription,
  hiddenRushSkus,
  pinnedRushSkus
}`;

export async function getRushProductsPageCopy(): Promise<RushProductsPageCopy> {
  try {
    const result = await client.fetch<RushProductsPageCopy | null>(RUSH_PRODUCTS_COPY_QUERY);
    return result ?? {};
  } catch {
    return {};
  }
}

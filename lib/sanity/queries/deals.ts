import { client } from '@/lib/sanity/client';

export interface DealsPageCopy {
  heading?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  hiddenDealSkus?: string[];
}

const DEALS_COPY_QUERY = `*[_type == "globalSettings"][0].dealsPage{
  heading,
  intro,
  metaTitle,
  metaDescription,
  hiddenDealSkus
}`;

export async function getDealsPageCopy(): Promise<DealsPageCopy> {
  try {
    const result = await client.fetch<DealsPageCopy | null>(DEALS_COPY_QUERY);
    return result ?? {};
  } catch {
    return {};
  }
}

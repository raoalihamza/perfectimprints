import type { Metadata } from 'next';
import { DealsPageBody } from '@/components/deals/DealsPageBody';
import { getAugmentedDealsData, applyHiddenSkus } from '@/lib/deals';
import { getDealsPageCopy } from '@/lib/sanity/queries/deals';
import { getCustomProductsForDeals } from '@/lib/sanity/queries/custom-products';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_META_TITLE = 'Deals: Sale & Closeout Promotional Products | Perfect Imprints';
const DEFAULT_META_DESCRIPTION =
  'Shop sale and closeout custom promotional products. Branded giveaways, corporate gifts, and bulk wholesale items at their lowest prices.';

// Fully static. Filter + pagination state live in the DealsClient component
// (URL never changes), so no searchParams plumbing is needed.
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getDealsPageCopy();
  return {
    title: { absolute: copy.metaTitle?.trim() || DEFAULT_META_TITLE },
    description: copy.metaDescription?.trim() || DEFAULT_META_DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/deals` },
  };
}

export default async function DealsPage() {
  const [copy, customDocs] = await Promise.all([
    getDealsPageCopy(),
    getCustomProductsForDeals(),
  ]);

  const augmented = getAugmentedDealsData({
    pinnedSkus: copy.pinnedDealSkus || [],
    customDocs,
  });
  const data = applyHiddenSkus(augmented, copy.hiddenDealSkus || []);

  return <DealsPageBody copy={copy} facets={data.facets} products={data.products} />;
}

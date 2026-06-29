import type { Metadata } from 'next';
import { DealsPageBody } from '@/components/deals/DealsPageBody';
import { getAugmentedDealsData, applyHiddenSkus } from '@/lib/deals';
import { getDealsPageCopy } from '@/lib/sanity/queries/deals';
import { getCustomProductsForDeals } from '@/lib/sanity/queries/custom-products';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_META_TITLE = 'Deals: Sale & Closeout Promotional Products | Perfect Imprints';
const DEFAULT_META_DESCRIPTION =
  'Shop sale and closeout custom promotional products. Branded giveaways, corporate gifts, and bulk wholesale items at their lowest prices.';

// ISR: statically rendered, auto-refreshed weekly and revalidated on-demand by
// the Sanity publish webhook (so custom products / pins / hides appear without a
// full rebuild). Filter + pagination state live in the DealsClient component
// (URL never changes), so no searchParams plumbing is needed.
export const revalidate = 604800;

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getDealsPageCopy();
  const title = copy.metaTitle?.trim() || DEFAULT_META_TITLE;
  const description = copy.metaDescription?.trim() || DEFAULT_META_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/deals` },
    ...socialMeta({ title, description, url: `${SITE_URL}/deals` }),
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

  return (
    <>
      <CustomSchemaJsonLd path="/deals" />
      <DealsPageBody copy={copy} facets={data.facets} products={data.products} />
    </>
  );
}

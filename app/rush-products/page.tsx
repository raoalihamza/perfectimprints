import type { Metadata } from 'next';
import { RushProductsPageBody } from '@/components/rush-products/RushProductsPageBody';
import { getAugmentedRushProductsData, applyHiddenSkus } from '@/lib/rush-products';
import { getRushProductsPageCopy } from '@/lib/sanity/queries/rush-products';
import { getCustomProductsForRushProducts } from '@/lib/sanity/queries/custom-products';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_META_TITLE = 'Rush Promotional Products | Perfect Imprints';
const DEFAULT_META_DESCRIPTION =
  'Custom promotional products on a 24-hour rush. Branded giveaways, corporate gifts, and bulk wholesale items with your logo - shipped the next business day.';

// ISR: statically rendered, auto-refreshed weekly and revalidated on-demand by
// the Sanity publish webhook (so custom products / pins / hides appear without a
// full rebuild). Filter + pagination state live in the RushProductsClient
// component (URL never changes), so no searchParams plumbing is needed.
export const revalidate = 604800;

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getRushProductsPageCopy();
  const title = copy.metaTitle?.trim() || DEFAULT_META_TITLE;
  const description = copy.metaDescription?.trim() || DEFAULT_META_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/rush-products` },
    ...socialMeta({ title, description, url: `${SITE_URL}/rush-products` }),
  };
}

export default async function RushProductsPage() {
  const [copy, customDocs] = await Promise.all([
    getRushProductsPageCopy(),
    getCustomProductsForRushProducts(),
  ]);

  const augmented = getAugmentedRushProductsData({
    pinnedSkus: copy.pinnedRushSkus || [],
    customDocs,
  });
  const data = applyHiddenSkus(augmented, copy.hiddenRushSkus || []);

  return <RushProductsPageBody copy={copy} facets={data.facets} products={data.products} />;
}

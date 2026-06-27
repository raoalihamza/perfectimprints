import type { Metadata } from 'next';
import { NewProductsPageBody } from '@/components/new-products/NewProductsPageBody';
import { getAugmentedNewProductsData, applyHiddenSkus } from '@/lib/new-products';
import { getNewProductsPageCopy } from '@/lib/sanity/queries/new-products';
import { getCustomProductsForNewProducts } from '@/lib/sanity/queries/custom-products';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_META_TITLE = 'New Custom Imprinted Products | Perfect Imprints';
const DEFAULT_META_DESCRIPTION =
  'Browse the newest custom promotional products in our catalog. Branded giveaways, corporate gifts, and bulk wholesale items with your logo - fresh arrivals updated weekly.';

// ISR: statically rendered, auto-refreshed weekly and revalidated on-demand by
// the Sanity publish webhook (so custom products / pins / hides appear without a
// full rebuild). Filter + pagination state live in the NewProductsClient
// component (URL never changes), so no searchParams plumbing is needed.
export const revalidate = 604800;

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getNewProductsPageCopy();
  const title = copy.metaTitle?.trim() || DEFAULT_META_TITLE;
  const description = copy.metaDescription?.trim() || DEFAULT_META_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/new-products` },
    ...socialMeta({ title, description, url: `${SITE_URL}/new-products` }),
  };
}

export default async function NewProductsPage() {
  const [copy, customDocs] = await Promise.all([
    getNewProductsPageCopy(),
    getCustomProductsForNewProducts(),
  ]);

  const augmented = getAugmentedNewProductsData({
    pinnedSkus: copy.pinnedNewProductSkus || [],
    customDocs,
  });
  const data = applyHiddenSkus(augmented, copy.hiddenNewProductSkus || []);

  return <NewProductsPageBody copy={copy} facets={data.facets} products={data.products} />;
}

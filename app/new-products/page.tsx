import type { Metadata } from 'next';
import { NewProductsPageBody } from '@/components/new-products/NewProductsPageBody';
import { getNewProductsData, applyHiddenSkus } from '@/lib/new-products';
import { getNewProductsPageCopy } from '@/lib/sanity/queries/new-products';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_META_TITLE = 'New Custom Imprinted Products | Perfect Imprints';
const DEFAULT_META_DESCRIPTION =
  'Browse the newest custom promotional products in our catalog. Branded giveaways, corporate gifts, and bulk wholesale items with your logo - fresh arrivals updated weekly.';

// Fully static. Filter + pagination state live in the NewProductsClient component
// (URL never changes), so no searchParams plumbing is needed.
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getNewProductsPageCopy();
  return {
    title: { absolute: copy.metaTitle?.trim() || DEFAULT_META_TITLE },
    description: copy.metaDescription?.trim() || DEFAULT_META_DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/new-products` },
  };
}

export default async function NewProductsPage() {
  const copy = await getNewProductsPageCopy();
  const data = applyHiddenSkus(getNewProductsData(), copy.hiddenNewProductSkus || []);

  return <NewProductsPageBody copy={copy} facets={data.facets} products={data.products} />;
}

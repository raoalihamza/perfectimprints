import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import type { Metadata } from 'next';
import { NewProductsPageBody } from '@/components/new-products/NewProductsPageBody';
import { getAugmentedNewProductsData, applyHiddenSkus } from '@/lib/new-products';
import { getNewProductsPageCopy } from '@/lib/sanity/queries/new-products';
import { getCustomProductsForNewProducts } from '@/lib/sanity/queries/custom-products';
import { getProductPagesForNewProducts } from '@/lib/sanity/queries/product-pages';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { Schema } from '@/components/seo/Schema';
import { aggregatorItemListSchema } from '@/lib/seo/product-list-schema';
import { PRODUCTS_PER_PAGE } from '@/lib/product-types';
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
  const [copy, customDocs, productPageDocs] = await Promise.all([
    getNewProductsPageCopy(),
    getCustomProductsForNewProducts(),
    getProductPagesForNewProducts(),
  ]);

  const augmented = getAugmentedNewProductsData({
    pinnedSkus: copy.pinnedNewProductSkus || [],
    customDocs,
    productPageDocs,
  });
  // HIDE-100: the site-wide hide list is folded in alongside this page's own
  // list, so facet counts re-derive together and the sidebar cannot disagree
  // with the grid. `getSiteSettings()` is the layout's deduped, tag-cached read.
  const data = applyHiddenSkus(augmented, [
    ...(copy.hiddenNewProductSkus || []),
    ...(await getHiddenProductContext()).hiddenSkus,
  ]);

  // Full-product ItemList (SNIP-120), via the shared SNIP-100 serializer. Built
  // from `data.products` - the SAME array handed to the grid below - so the
  // markup cannot describe anything the page does not show: site-wide hidden
  // SKUs, product-page-replaced SKUs and this page's own hidden list are all
  // already gone, and the pinned/custom/scraped order is preserved. Paging here
  // is client state at a single URL, so the block covers the first
  // PRODUCTS_PER_PAGE - exactly what the initial HTML renders. Pure function,
  // no read of any kind: the route stays static.
  const itemList = aggregatorItemListSchema(data.products, PRODUCTS_PER_PAGE);

  return (
    <>
      {itemList ? <Schema data={itemList} /> : null}
      <CustomSchemaJsonLd path="/new-products" />
      <NewProductsPageBody copy={copy} facets={data.facets} products={data.products} />
    </>
  );
}

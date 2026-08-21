import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import type { Metadata } from 'next';
import { DealsPageBody } from '@/components/deals/DealsPageBody';
import { getAugmentedDealsData, applyHiddenSkus } from '@/lib/deals';
import { getDealsPageCopy } from '@/lib/sanity/queries/deals';
import { getCustomProductsForDeals } from '@/lib/sanity/queries/custom-products';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { Schema } from '@/components/seo/Schema';
import { aggregatorItemListSchema } from '@/lib/seo/product-list-schema';
import { PRODUCTS_PER_PAGE } from '@/lib/product-types';
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
  // HIDE-100: the site-wide hide list is folded in alongside this page's own
  // list, so facet counts re-derive together and the sidebar cannot disagree
  // with the grid. `getSiteSettings()` is the layout's deduped, tag-cached read.
  const data = applyHiddenSkus(augmented, [
    ...(copy.hiddenDealSkus || []),
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
      <CustomSchemaJsonLd path="/deals" />
      <DealsPageBody copy={copy} facets={data.facets} products={data.products} />
    </>
  );
}

import { cachedClient } from '@/lib/sanity/client';
import { SETTINGS_TAG } from '@/lib/sanity/cache-tags';

// Q-175: moved off the CDN `client` onto the non-CDN `cachedClient` with a
// cache tag. This copy lives on the `globalSettings` singleton and carries the
// hidden/pinned SKU lists that curate /new-products - exactly the kind of editorial
// lever Patrick pulls and expects to take effect. The CDN read made a publish a
// race: /new-products rebuilds on the globalSettings webhook, the CDN was still
// serving its pre-publish copy, and the route's own revalidate is ONE WEEK, so a
// lost race meant a hidden product kept showing for up to seven days. SETTINGS_TAG
// (not a new tag) because the data IS globalSettings, and the webhook already
// busts it on publish. The weekly interval stays as the backstop.
const COPY_FETCH_OPTS = { next: { tags: [SETTINGS_TAG], revalidate: false as const } };

export interface NewProductsPageCopy {
  heading?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  hiddenNewProductSkus?: string[];
  pinnedNewProductSkus?: string[];
}

const NEW_PRODUCTS_COPY_QUERY = `*[_type == "globalSettings"][0].newProductsPage{
  heading,
  intro,
  metaTitle,
  metaDescription,
  hiddenNewProductSkus,
  pinnedNewProductSkus
}`;

export async function getNewProductsPageCopy(): Promise<NewProductsPageCopy> {
  try {
    const result = await cachedClient.fetch<NewProductsPageCopy | null>(NEW_PRODUCTS_COPY_QUERY, {}, COPY_FETCH_OPTS);
    return result ?? {};
  } catch {
    return {};
  }
}

import { cachedClient } from '@/lib/sanity/client';
import { SETTINGS_TAG } from '@/lib/sanity/cache-tags';

// Q-175: moved off the CDN `client` onto the non-CDN `cachedClient` with a
// cache tag. This copy lives on the `globalSettings` singleton and carries the
// hidden/pinned SKU lists that curate /deals - exactly the kind of editorial
// lever Patrick pulls and expects to take effect. The CDN read made a publish a
// race: /deals rebuilds on the globalSettings webhook, the CDN was still
// serving its pre-publish copy, and the route's own revalidate is ONE WEEK, so a
// lost race meant a hidden product kept showing for up to seven days. SETTINGS_TAG
// (not a new tag) because the data IS globalSettings, and the webhook already
// busts it on publish. The weekly interval stays as the backstop.
const COPY_FETCH_OPTS = { next: { tags: [SETTINGS_TAG], revalidate: false as const } };

export interface DealsPageCopy {
  heading?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  hiddenDealSkus?: string[];
  pinnedDealSkus?: string[];
}

const DEALS_COPY_QUERY = `*[_type == "globalSettings"][0].dealsPage{
  heading,
  intro,
  metaTitle,
  metaDescription,
  hiddenDealSkus,
  pinnedDealSkus
}`;

export async function getDealsPageCopy(): Promise<DealsPageCopy> {
  try {
    const result = await cachedClient.fetch<DealsPageCopy | null>(DEALS_COPY_QUERY, {}, COPY_FETCH_OPTS);
    return result ?? {};
  } catch {
    return {};
  }
}

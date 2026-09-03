import type { Metadata } from 'next';
import { cache } from 'react';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Schema } from '@/components/seo/Schema';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { PortfolioBrowser } from '@/components/portfolio/PortfolioBrowser';
import { PortfolioEmptyState } from '@/components/portfolio/PortfolioEmptyState';
import { RichAnswer } from '@/components/portable-text/RichAnswer';
import {
  getAllPortfolioCategoriesOrThrow,
  getAllPortfolioItemsOrThrow,
} from '@/lib/sanity/queries/portfolio';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { buildPortfolioFacetSections } from '@/lib/portfolio/page-filters';
import {
  portfolioRepresentativeImage,
  toPortfolioTile,
  type PortfolioTile,
} from '@/lib/portfolio/tile-data';
import type { PortfolioCategoryRef, PortfolioItemCard } from '@/lib/portfolio/gallery';
import { collectionPageSchema } from '@/lib/seo/schema-generators';
import { largeSocialImage, socialMeta } from '@/lib/seo/open-graph';

/**
 * /portfolio, the Portfolio Gallery page (PORT-110).
 *
 * STATIC BY CONTRACT (the /cat lesson, CLAUDE.md Section 13). This route is
 * prerendered once per deploy and refreshed only by the Sanity webhook, and
 * three things would silently break that, so none of them is here:
 *   1. It reads NO `searchParams`. The filters live in the query string
 *      (`/portfolio?category=caps-and-hats&color=black`) but that string is
 *      read by the client browser from `window.location` AFTER mount and
 *      applied in memory. Every filtered URL serves this same static HTML.
 *   2. Every Sanity read is the non-CDN `cachedClient` carrying PORTFOLIO_TAG
 *      with `revalidate: false` (lib/sanity/queries/portfolio.ts), never
 *      `no-store`; the webhook busts the tag on any portfolio publish. The
 *      page introduction (PORT-115) is the ONE other read, and it is the
 *      same React-cached, SETTINGS_TAG-tagged `getSiteSettings()` the layout
 *      Footer already performs in this render, so it adds no fetch and no
 *      untagged read; the webhook's globalSettings branch busts that tag.
 *   3. No client component under this route calls `useSearchParams()`, which
 *      during prerender forces a CSR bailout that swaps the whole page body
 *      for the loading skeleton while the build still reports it static.
 * PORT-000 measured why this matters: the dynamic /promotional-products is
 * `no-store` and an edge MISS on every hit; /videos and /new-products are
 * prerendered edge HITs. An image-heavy page belongs in the second group.
 *
 * THE CANONICAL IS ALWAYS THE CLEAN URL, on every filtered view, because
 * every filtered view IS this document: same HTML, same items, filtered in
 * the browser. No noindex is needed for a query-string variant and none is
 * emitted for it.
 *
 * INDEXABILITY FOLLOWS THE DATA. With zero published items the page renders a
 * clean empty state, carries `noindex, follow`, and is left out of the
 * sitemap; the moment an item is published the webhook rebuilds this page
 * and the sitemap, the robots restriction disappears, and the sitemap gains
 * `/portfolio` with one image entry per item. Nobody has to flip a switch.
 * This is the page's real state at launch (Patrick has not sent photographs
 * yet), so it is the state most carefully checked.
 *
 * Structured data: CollectionPage (only when there are items) and the
 * BreadcrumbList the shared Breadcrumbs component emits. Nothing else. A
 * photograph of a finished job has no date, rating, price or identifier, and
 * none is invented; no ImageObject is emitted (SNIP-172).
 */
export const dynamic = 'force-static';
export const revalidate = false;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const PORTFOLIO_PATH = '/portfolio';
const PORTFOLIO_URL = `${SITE_URL}${PORTFOLIO_PATH}`;
const PORTFOLIO_TITLE = 'Portfolio of Custom Promotional Products | Perfect Imprints';
// Under 155 characters (CLAUDE.md Section 9), since it is also the og / twitter
// description and the CollectionPage description.
const PORTFOLIO_DESCRIPTION =
  'See custom promotional products we have produced: printed shirts, embroidered caps, branded drinkware, bags and signs. Filter by category and color.';

interface PortfolioPageData {
  /** The items that became tiles, in site order (the facet source). */
  items: PortfolioItemCard[];
  tiles: PortfolioTile[];
  categories: PortfolioCategoryRef[];
}

// One read for generateMetadata and the page body within a render (React
// cache dedupes the promise; the fetches underneath are tag-cached). The
// THROWING reads on purpose: this page turns an empty result into noindex
// and "out of the sitemap", so a Sanity outage must not look like emptiness.
// A throw fails the build loudly, or on a webhook regeneration leaves the
// previous static copy serving, instead of baking a noindex page.
const loadPortfolio = cache(async (): Promise<PortfolioPageData> => {
  const [allItems, categories] = await Promise.all([
    getAllPortfolioItemsOrThrow(),
    getAllPortfolioCategoriesOrThrow(),
  ]);
  const items: PortfolioItemCard[] = [];
  const tiles: PortfolioTile[] = [];
  for (const item of allItems) {
    const tile = toPortfolioTile(item);
    if (!tile) continue;
    items.push(item);
    tiles.push(tile);
  }
  return { items, tiles, categories };
});

export async function generateMetadata(): Promise<Metadata> {
  const { items, tiles } = await loadPortfolio();
  // The shared IMG-110 helper raises the card-size URL toward 1200px without
  // ever upscaling. Called, never edited (it is shared with /cat).
  const image = largeSocialImage(portfolioRepresentativeImage(items));
  return {
    title: { absolute: PORTFOLIO_TITLE },
    description: PORTFOLIO_DESCRIPTION,
    alternates: { canonical: PORTFOLIO_URL },
    // Data-driven indexability: noindex while there is nothing to index. The
    // key is omitted entirely once items exist so the layout's googleBot
    // default (max-image-preview: large) still applies (shallow merge).
    ...(tiles.length === 0 ? { robots: { index: false, follow: true } } : {}),
    ...socialMeta({
      title: PORTFOLIO_TITLE,
      description: PORTFOLIO_DESCRIPTION,
      url: PORTFOLIO_URL,
      image,
      imageAlt: tiles[0]?.alt,
    }),
  };
}

export default async function PortfolioPage() {
  const [{ items, tiles, categories }, settings] = await Promise.all([
    loadPortfolio(),
    getSiteSettings(),
  ]);
  const sections = buildPortfolioFacetSections(items, categories);
  const image = largeSocialImage(portfolioRepresentativeImage(items));
  // Patrick's introduction (Global Settings > Portfolio Page), shown in place
  // of the standard one-line opening below. Never in the empty state, which
  // has its own copy (PORT-110), and never when the field is blank: a blank
  // intro keeps the standard line, so the page always opens with a sentence.
  const intro = tiles.length > 0 ? settings.portfolioIntro : null;

  return (
    <>
      {tiles.length > 0 ? (
        <Schema
          data={collectionPageSchema({
            name: 'Portfolio',
            url: PORTFOLIO_URL,
            description: PORTFOLIO_DESCRIPTION,
            ...(image ? { image } : {}),
          })}
        />
      ) : null}
      <CustomSchemaJsonLd path={PORTFOLIO_PATH} />

      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Portfolio' }]} />
      </Container>

      <Container as="section" className="pb-6">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Portfolio
        </h1>
        {intro ? (
          <RichAnswer value={intro} className="mt-3 max-w-3xl text-lg leading-relaxed text-text-primary" />
        ) : (
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-text-primary">
            Real jobs we have produced for real customers: printed apparel, embroidered caps, branded
            drinkware, bags, signs and more. Filter by category or color, and click any photo to see
            it larger.
          </p>
        )}
      </Container>

      <Container as="section" className="pb-12">
        {tiles.length === 0 ? (
          <PortfolioEmptyState />
        ) : (
          <PortfolioBrowser tiles={tiles} sections={sections} />
        )}
      </Container>
    </>
  );
}

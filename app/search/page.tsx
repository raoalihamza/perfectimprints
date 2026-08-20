import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { SearchPageForm } from '@/components/search/SearchPageForm';
import { SearchAlsoMatching } from '@/components/search/SearchAlsoMatching';
import { SearchFacetedResults } from '@/components/search/SearchFacetedResults';
import { SearchEmptyCTA } from '@/components/search/SearchEmptyCTA';
import { searchProducts } from '@/lib/search/server-search';
import { buildSearchFacets } from '@/lib/search/build-facets';
import { buildHiddenSkuSet } from '@/lib/search/hidden-skus';
import { searchHiddenSkus } from '@/lib/products/site-wide-hidden';
import { socialMeta } from '@/lib/seo/open-graph';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Search results are user-specific and infinite-variant — never index them. A
// self-canonical to the clean /search URL (no ?q=) keeps every query variant
// pointing at one address.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `Search results for “${q}”` : 'Search';
  const description =
    'Search Perfect Imprints for custom promotional products, branded apparel, categories, and brands.';
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/search` },
    robots: { index: false, follow: true },
    ...socialMeta({ title, description, url: `${SITE_URL}/search` }),
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  // Product matches + facets are resolved server-side from the full catalog
  // (products.json) — the lightweight client index can't render cards/facets.
  //
  // Q-170: this is the SECOND of the two search read paths, and it is the one
  // that would otherwise keep showing a product Patrick had already hidden from
  // the overlay. HIDE-110: `searchHiddenSkus()` is the single definition of what
  // search hides (the search-only list, the site-wide list, and every SKU a
  // published product page has replaced). Both reads behind it are
  // React-cache()d and tag-cached, and the layout already performs one of them
  // in this render. Facets are built from the FILTERED list, so a hidden
  // product leaves no trace in the sidebar counts either.
  const hiddenSkus = buildHiddenSkuSet(query ? await searchHiddenSkus() : []);
  const products = query ? searchProducts(query, 300, hiddenSkus) : [];
  const facets = products.length > 0 ? buildSearchFacets(products) : [];

  return (
    <Container as="section" className="py-10 sm:py-12">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        {query ? (
          <>
            Search results for <span className="text-brand-red">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          'Search'
        )}
      </h1>
      <p className="mt-2 text-text-muted">
        Find products, categories, brands, and blog posts across Perfect Imprints.
      </p>

      <div className="mt-6 max-w-3xl">
        <SearchPageForm initialQuery={query} />
      </div>

      {query ? (
        <div className="mt-8">
          {/* Categories / brands / blogs that match — client-side over the same index. */}
          <SearchAlsoMatching query={query} />

          {products.length > 0 ? (
            <SearchFacetedResults products={products} facets={facets} />
          ) : (
            <SearchEmptyCTA query={query} variant="block" />
          )}
        </div>
      ) : (
        <p className="mt-8 text-text-muted">
          Start typing above to search products, categories, brands, and blog posts.
        </p>
      )}
    </Container>
  );
}

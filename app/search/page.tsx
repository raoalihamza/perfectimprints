import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { SearchPageForm } from '@/components/search/SearchPageForm';
import { SearchAlsoMatching } from '@/components/search/SearchAlsoMatching';
import { SearchFacetedResults } from '@/components/search/SearchFacetedResults';
import { SearchEmptyCTA } from '@/components/search/SearchEmptyCTA';
import { searchProducts } from '@/lib/search/server-search';
import { buildSearchFacets } from '@/lib/search/build-facets';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// Search results are user-specific and infinite-variant — never index them.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `Search results for “${q}”` : 'Search';
  return {
    title,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  // Product matches + facets are resolved server-side from the full catalog
  // (products.json) — the lightweight client index can't render cards/facets.
  const products = query ? searchProducts(query) : [];
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

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CTABanner } from '@/components/category/CTABanner';
import type { GeigerProduct } from '@/lib/categories';
import type { NewProductsPageCopy } from '@/lib/sanity/queries/new-products';
import type { NewProductsFacetSection } from '@/lib/new-products';
import { NewProductsClient } from './NewProductsClient';

interface NewProductsPageBodyProps {
  copy: NewProductsPageCopy;
  facets: NewProductsFacetSection[];
  products: GeigerProduct[];
}

const DEFAULT_HEADING = 'New Custom Imprinted Products';
const DEFAULT_INTRO =
  'The latest custom promotional products to hit our catalog. Branded giveaways, corporate gifts, and bulk wholesale items - freshly added by our suppliers and ready to ship with your logo.';

export function NewProductsPageBody({ copy, facets, products }: NewProductsPageBodyProps) {
  const heading = copy.heading?.trim() || DEFAULT_HEADING;
  const intro = copy.intro?.trim() || DEFAULT_INTRO;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'New Products' }]} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-primary">{intro}</p>
      </Container>

      <Container as="section" className="pb-10">
        <NewProductsClient products={products} facets={facets} />
      </Container>

      <CTABanner categoryTitle="Promotional Products" />
    </>
  );
}

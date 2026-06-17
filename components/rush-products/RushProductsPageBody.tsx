import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CTABanner } from '@/components/category/CTABanner';
import type { GeigerProduct } from '@/lib/categories';
import type { RushProductsPageCopy } from '@/lib/sanity/queries/rush-products';
import type { RushProductsFacetSection } from '@/lib/rush-products';
import { RushProductsClient } from './RushProductsClient';

interface RushProductsPageBodyProps {
  copy: RushProductsPageCopy;
  facets: RushProductsFacetSection[];
  products: GeigerProduct[];
}

const DEFAULT_HEADING = 'Rush Promotional Products';
const DEFAULT_INTRO =
  'Need it fast? These custom promotional products ship on a 24-hour rush. Branded giveaways, corporate gifts, and bulk wholesale items with your logo - in production by the daily cutoff and out the door the next business day.';

export function RushProductsPageBody({ copy, facets, products }: RushProductsPageBodyProps) {
  const heading = copy.heading?.trim() || DEFAULT_HEADING;
  const intro = copy.intro?.trim() || DEFAULT_INTRO;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Rush Products' }]} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-primary">{intro}</p>
      </Container>

      <Container as="section" className="pb-10">
        <RushProductsClient products={products} facets={facets} />
      </Container>

      <CTABanner categoryTitle="Promotional Products" />
    </>
  );
}

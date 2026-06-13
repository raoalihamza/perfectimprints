import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CTABanner } from '@/components/category/CTABanner';
import type { GeigerProduct } from '@/lib/categories';
import type { DealsPageCopy } from '@/lib/sanity/queries/deals';
import type { DealsFacetSection } from '@/lib/deals';
import { DealsClient } from './DealsClient';

interface DealsPageBodyProps {
  copy: DealsPageCopy;
  facets: DealsFacetSection[];
  products: GeigerProduct[];
}

const DEFAULT_HEADING = 'Promotional Products on Sale and Closeout';
const DEFAULT_INTRO =
  'Every custom promotional product currently on sale or marked closeout, in one place. Branded giveaways, corporate gifts, and bulk wholesale items at their lowest prices - order while quantities last.';

export function DealsPageBody({ copy, facets, products }: DealsPageBodyProps) {
  const heading = copy.heading?.trim() || DEFAULT_HEADING;
  const intro = copy.intro?.trim() || DEFAULT_INTRO;

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Deals' }]} />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-primary">{intro}</p>
      </Container>

      <Container as="section" className="pb-10">
        <DealsClient products={products} facets={facets} />
      </Container>

      <CTABanner categoryTitle="Promotional Products" />
    </>
  );
}

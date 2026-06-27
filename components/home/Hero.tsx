import { Container } from '@/components/ui/Container';
import type { HomeHero } from '@/lib/sanity/queries/home';

// Defaults mirror the seeded Sanity copy so the (text) hero never renders empty
// even before the homePage singleton is saved. Once Patrick edits it in Studio,
// Sanity wins. Kept text-only so the LCP element stays text-bound and fast.
const DEFAULT_EYEBROW = 'BULK PROMOTIONAL EXPERTS SINCE 1999';
const DEFAULT_HEADLINE = 'Custom Promotional Products That People Actually Use';
const DEFAULT_SUBHEAD =
  'Branded apparel, drinkware, bags, tech, and giveaways for trade shows, employee gifts, safety programs, and customer thank-yous. 22,000+ products with bulk volume pricing, rush options, and free art proofs.';

interface HeroProps {
  hero: HomeHero | null;
}

export function Hero({ hero }: HeroProps) {
  const eyebrow = hero?.eyebrow?.trim() || DEFAULT_EYEBROW;
  const headline = hero?.headline?.trim() || DEFAULT_HEADLINE;
  const sub = hero?.subheadline?.trim() || DEFAULT_SUBHEAD;

  return (
    <section className="border-b border-border bg-white">
      <Container className="py-12 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight tracking-tight text-brand-ink md:text-4xl lg:text-5xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-primary md:text-lg">
          {sub}
        </p>
      </Container>
    </section>
  );
}

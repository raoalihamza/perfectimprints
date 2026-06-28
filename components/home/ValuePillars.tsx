import { Container } from '@/components/ui/Container';
import type { HomeValueProp } from '@/lib/sanity/queries/home';
import { PillarCard } from '@/components/home/PillarCard';
import { ValuePillarsCarouselLazy } from '@/components/home/ValuePillarsCarouselLazy';

interface ValuePillarsProps {
  pillars: HomeValueProp[];
}

export function ValuePillars({ pillars }: ValuePillarsProps) {
  if (pillars.length === 0) return null;

  return (
    <section className="border-y border-border bg-bg-soft">
      <Container className="py-10 md:py-14">
        {pillars.length <= 3 ? (
          // 3 or fewer → the original static grid, unchanged.
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {pillars.map((p) => (
              <li key={p.title}>
                <PillarCard pillar={p} />
              </li>
            ))}
          </ul>
        ) : (
          // More than 3 → rotating carousel showing up to 3 at a time.
          <ValuePillarsCarouselLazy pillars={pillars} />
        )}
      </Container>
    </section>
  );
}

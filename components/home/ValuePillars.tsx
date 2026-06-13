import { Container } from '@/components/ui/Container';
import type { HomeValueProp } from '@/lib/sanity/queries/home';

interface ValuePillarsProps {
  pillars: HomeValueProp[];
}

export function ValuePillars({ pillars }: ValuePillarsProps) {
  if (pillars.length === 0) return null;

  return (
    <section className="border-y border-border bg-bg-soft">
      <Container className="py-10 md:py-14">
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {pillars.map((p) => (
            <li
              key={p.title}
              className="rounded-md border border-border bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-brand-ink md:text-xl">{p.title}</h2>
              {p.body && (
                <p className="mt-2 text-sm leading-relaxed text-text-primary md:text-base">
                  {p.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

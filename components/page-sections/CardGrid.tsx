import Link from 'next/link';
import { SectionShell } from './SectionShell';
import { SectionImage } from './SectionImage';
import type { CardGridSection } from '@/lib/sanity/queries/pages';

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export function CardGrid({ section }: { section: CardGridSection }) {
  const { heading, columns, cards } = section;
  if (!cards || cards.length === 0) return null;
  const colClass = COLS[columns ?? 3] ?? COLS[3];

  return (
    <SectionShell>
      {heading && (
        <h2 className="mb-6 text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
      )}
      <div className={`grid grid-cols-1 gap-6 ${colClass}`}>
        {cards.map((c, i) => {
          const external = c.ctaHref ? /^https?:\/\//i.test(c.ctaHref) : false;
          return (
            <div
              key={c._key ?? i}
              className="flex flex-col overflow-hidden rounded-md border border-border bg-white"
            >
              {(c.image?.asset?._ref || c.imageUrl) && (
                <SectionImage
                  image={c.image}
                  imageUrl={c.imageUrl}
                  alt={c.title}
                  width={600}
                  className="h-44 w-full object-cover"
                />
              )}
              <div className="flex flex-1 flex-col p-5">
                {c.title && (
                  <h3 className="text-lg font-semibold text-brand-ink">{c.title}</h3>
                )}
                {c.text && (
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-text-primary">{c.text}</p>
                )}
                {c.ctaLabel && c.ctaHref && (
                  <div className="mt-4">
                    {external ? (
                      <a
                        href={c.ctaHref}
                        className="inline-flex h-10 items-center justify-center rounded border border-brand-ink px-4 text-sm font-medium text-brand-ink hover:bg-brand-ink hover:text-white"
                      >
                        {c.ctaLabel}
                      </a>
                    ) : (
                      <Link
                        href={c.ctaHref}
                        className="inline-flex h-10 items-center justify-center rounded border border-brand-ink px-4 text-sm font-medium text-brand-ink hover:bg-brand-ink hover:text-white"
                      >
                        {c.ctaLabel}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

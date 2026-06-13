import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import type { Brand } from '@/lib/brands';

interface BrandsStripProps {
  brands: Brand[];
  heading: string;
  subheading: string | null;
}

/**
 * "Brands We Carry" — distinct from Geiger's client-logo wall. These are the
 * brand suppliers whose products we imprint (YETI, Carhartt, JBL, etc.).
 * Logos link to `/brands/[slug]` so SEO juice flows back into the per-brand
 * landing pages.
 */
export function BrandsStrip({ brands, heading, subheading }: BrandsStripProps) {
  // Filter to brands with a real logo + slug, sort featured-first then by
  // catalog depth, and cap at 18 for a clean 6×3 desktop grid.
  const visible = brands
    .filter((b) => b.logoUrl && b.slug)
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return b.productCount - a.productCount;
    })
    .slice(0, 18);

  if (visible.length === 0) return null;

  return (
    <section>
      <Container className="py-14 md:py-20">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
          {subheading && (
            <p className="mt-2 text-base text-text-primary">{subheading}</p>
          )}
        </div>

        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4">
          {visible.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/brands/${b.slug}`}
                className="group flex h-20 items-center justify-center rounded border border-border bg-white px-4 transition hover:-translate-y-0.5 hover:border-brand-ink hover:shadow-sm md:h-24"
                aria-label={`Shop ${b.name}`}
                title={b.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.logoUrl!}
                  alt={b.logoAlt || b.name}
                  loading="lazy"
                  className="max-h-10 w-auto max-w-full object-contain opacity-80 transition group-hover:opacity-100 md:max-h-12"
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 text-center">
          <Link
            href="/brands"
            className="inline-flex items-center text-sm font-semibold text-brand-red hover:underline"
          >
            See all brands →
          </Link>
        </div>
      </Container>
    </section>
  );
}

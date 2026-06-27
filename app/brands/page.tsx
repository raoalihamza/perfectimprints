import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { getBrandsGroupedByLetter, type Brand } from '@/lib/brands';
import { socialMeta } from '@/lib/seo/open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

export async function generateMetadata(): Promise<Metadata> {
  const grouped = await getBrandsGroupedByLetter();
  const total = grouped.reduce((sum, g) => sum + g.brands.length, 0);
  const title = 'Shop Promotional Products by Brand | Perfect Imprints';
  const description = `Custom products from over ${total} brands. Browse logos and shop A-Z for promotional items, corporate gifts, and event giveaways.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/brands` },
    ...socialMeta({ title, description, url: `${SITE_URL}/brands` }),
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function BrandCard({ brand }: { brand: Brand }) {
  const linkable = brand.productCount > 0;
  const inner = (
    <div className="flex h-full flex-col items-center justify-between gap-3 rounded border border-border bg-white p-4 text-center transition hover:border-brand-ink hover:shadow-sm">
      <div className="flex h-16 w-full items-center justify-center">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.logoAlt || brand.name}
            width={160}
            height={64}
            loading="lazy"
            className="max-h-16 w-auto max-w-full object-contain"
          />
        ) : (
          <span className="line-clamp-2 px-2 text-base font-semibold text-brand-ink">
            {brand.name}
          </span>
        )}
      </div>
      <div className="w-full">
        <p className="text-sm font-medium text-brand-ink">{brand.name}</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {brand.productCount > 0
            ? `${brand.productCount} ${brand.productCount === 1 ? 'product' : 'products'}`
            : 'New brand listing'}
        </p>
      </div>
    </div>
  );

  if (!linkable) {
    return <div className="h-full opacity-60">{inner}</div>;
  }

  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
      prefetch={false}
    >
      {inner}
    </Link>
  );
}

export default async function BrandsIndexPage() {
  const grouped = await getBrandsGroupedByLetter();
  const totalBrands = grouped.reduce((sum, g) => sum + g.brands.length, 0);
  const presentLetters = new Set(grouped.map((g) => g.letter));

  return (
    <>
      <Container as="section" className="pb-4 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Brands' },
          ]}
        />
      </Container>

      <Container as="section" className="pb-8">
        <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl lg:text-5xl">
          Shop By Brand
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-text-primary">
          Browse promotional products and corporate gifts from {totalBrands}+ name brands.
          Find the brand your team trusts and customize every piece with your logo.
        </p>
      </Container>

      <Container as="nav" aria-label="Brands A to Z" className="pb-6">
        <ul className="flex flex-wrap gap-1.5">
          {ALPHABET.map((letter) => {
            const isPresent = presentLetters.has(letter);
            return (
              <li key={letter}>
                {isPresent ? (
                  <a
                    href={`#letter-${letter}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded border border-border text-sm font-semibold text-brand-ink hover:border-brand-ink hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
                  >
                    {letter}
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-flex h-9 w-9 items-center justify-center rounded border border-border text-sm font-medium text-text-muted/50"
                  >
                    {letter}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Container>

      <Container as="section" className="space-y-10 pb-16">
        {grouped.map(({ letter, brands }) => (
          <section key={letter} id={`letter-${letter}`} className="scroll-mt-24">
            <h2 className="border-b border-border pb-2 text-2xl font-semibold text-brand-ink">
              {letter}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {brands.map((brand) => (
                <li key={brand.slug}>
                  <BrandCard brand={brand} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Container>
    </>
  );
}

import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { ProductCard } from '@/components/category/ProductCard';
import type { GeigerProduct } from '@/lib/product-types';

interface NewProductsRailProps {
  products: GeigerProduct[];
  heading: string;
}

export function NewProductsRail({ products, heading }: NewProductsRailProps) {
  if (products.length === 0) return null;

  return (
    <section className="bg-bg-soft">
      <Container className="py-14 md:py-20">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
            <p className="mt-2 max-w-xl text-sm text-text-primary md:text-base">
              Fresh arrivals from our wholesale suppliers — refreshed weekly.
            </p>
          </div>
          <Link
            href="/new-products"
            className="text-sm font-semibold text-brand-red hover:underline"
          >
            View all new products →
          </Link>
        </div>

        {/* Edge-fade scroll-snap rail. Cards size as fractions of the container
            so nothing gets visually clipped at the right edge. */}
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 hidden h-full w-12 bg-gradient-to-l from-bg-soft to-transparent sm:block"
          />
          <ul
            className="grid auto-cols-[80%] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[46%] md:auto-cols-[31%] lg:auto-cols-[23.5%] xl:auto-cols-[19%]"
            style={{
              scrollSnapType: 'x mandatory',
              scrollbarWidth: 'thin',
              scrollPaddingLeft: '0.25rem',
            }}
          >
            {products.map((p) => (
              <li key={p.sku} className="snap-start">
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

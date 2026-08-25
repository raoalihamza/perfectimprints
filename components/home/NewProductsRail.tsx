import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { ProductCard } from '@/components/category/ProductCard';
import { Schema } from '@/components/seo/Schema';
import { productItemListSchema } from '@/lib/seo/product-list-schema';
import type { GeigerProduct } from '@/lib/product-types';

interface NewProductsRailProps {
  products: GeigerProduct[];
  heading: string;
  /** Sub-line under the heading. Defaults to the new-arrivals copy. */
  subtitle?: string;
  /** "View all" link target. Defaults to /new-products. */
  viewAllHref?: string;
  /** "View all" link label. Defaults to "View all new products". */
  viewAllLabel?: string;
  /** Section background tint, so adjacent rails can alternate. */
  background?: 'soft' | 'white';
}

export function NewProductsRail({
  products,
  heading,
  subtitle = 'Fresh arrivals from our wholesale suppliers — refreshed weekly.',
  viewAllHref = '/new-products',
  viewAllLabel = 'View all new products',
  background = 'soft',
}: NewProductsRailProps) {
  if (products.length === 0) return null;

  // SNIP-160: a full-product ItemList over the SAME `products` array the rail
  // renders, through the shared serializer. The page hands this rail the
  // post-hide list (this page's own hide list + the site-wide one, applied
  // before the slice in getNewProducts / getRushProducts), so the block cannot
  // name a product the rail does not show. Each rail is its own list: the home
  // page carries one for New and one for Rush. Pure, so `/` stays force-static.
  const itemList = productItemListSchema(products);

  const sectionBg = background === 'white' ? 'bg-white' : 'bg-bg-soft';
  const fadeFrom = background === 'white' ? 'from-white' : 'from-bg-soft';

  return (
    <section className={sectionBg}>
      <Container className="py-14 md:py-20">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
            <p className="mt-2 max-w-xl text-sm text-text-primary md:text-base">{subtitle}</p>
          </div>
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-brand-red hover:underline"
          >
            {viewAllLabel} →
          </Link>
        </div>

        {/* Edge-fade scroll-snap rail. Cards size as fractions of the container
            so nothing gets visually clipped at the right edge. */}
        <div className="relative">
          <div
            aria-hidden
            className={`pointer-events-none absolute right-0 top-0 hidden h-full w-12 bg-gradient-to-l ${fadeFrom} to-transparent sm:block`}
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
      <Schema data={itemList} />
    </section>
  );
}

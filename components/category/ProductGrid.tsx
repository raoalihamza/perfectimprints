import { affiliateUrl } from '@/lib/affiliate-url';
import type { GeigerProduct } from '@/lib/categories';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: GeigerProduct[];
  priorityCount?: number;
}

export function ProductGrid({ products, priorityCount = 4 }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded border border-border bg-bg-soft p-10 text-center">
        <h2 className="text-xl font-semibold text-brand-ink">
          No products found in this category
        </h2>
        <p className="mx-auto mt-2 max-w-prose text-text-muted">
          Browse the full Geiger catalog to find what you need, or contact us for help
          sourcing the right product.
        </p>
        <a
          href={affiliateUrl(null)}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-6 inline-flex h-11 items-center justify-center rounded bg-brand-green px-5 font-medium text-white hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          Browse the full catalog
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, idx) => (
        <ProductCard
          key={product.sku}
          product={product}
          priority={idx < priorityCount}
        />
      ))}
    </div>
  );
}

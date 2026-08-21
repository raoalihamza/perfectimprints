import Link from 'next/link';
import { affiliateUrl } from '@/lib/affiliate-url';
import { cn } from '@/lib/utils';
import type { GeigerProduct } from '@/lib/product-types';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: GeigerProduct;
  priority?: boolean;
}

const IMAGE_W = 275;
const IMAGE_H = 275;

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function priceLabel(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  if (low != null && high != null && low !== high) {
    return `${formatPrice(low)} - ${formatPrice(high)}`;
  }
  const single = (low ?? high) as number;
  return formatPrice(single);
}

function pickRibbon(product: GeigerProduct): { label: string; className: string } | null {
  const tags = new Set((product.badges ?? []).map((b) => b.tag?.toLowerCase()));
  if (tags.has('closeout')) {
    return { label: 'CLOSEOUT', className: 'bg-brand-ink text-white' };
  }
  if (product.is_on_sale || tags.has('sale')) {
    return { label: 'SALE', className: 'bg-brand-red text-white' };
  }
  if (product.is_new_item || tags.has('new')) {
    return { label: 'NEW', className: 'bg-brand-green text-white' };
  }
  return null;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  // Products with an internal detail page (Sanity productPage docs, P2-CP-001)
  // link to /products/<slug> in the SAME tab with no sponsored rel. Everything
  // else (scraped Geiger + customProduct) keeps the affiliate behavior exactly
  // as before: new tab, noopener noreferrer sponsored.
  const detailHref = product.detailUrl || null;
  const href = detailHref ?? affiliateUrl(product.geiger_url);
  // IMG-100: no entity decoding happens here any more. `imageUrl` arrives
  // already decoded from the data loader, which is where HTML entity decoding
  // belongs (CLAUDE.md section 17). The local patch this card used to carry
  // masked four loaders that never decoded the field, so the bug stayed
  // invisible until a NON-card consumer (the SNIP-120 ItemList image) read the
  // same field and got the raw entity. Do not reintroduce it: fix the loader.
  const imageSrc = product.imageUrl;
  const price = priceLabel(product.low_price, product.high_price);
  const ribbon = pickRibbon(product);
  // Show the Geiger SKU ("Item #") like geiger.com. Hide synthesized SKUs for
  // custom (non-Geiger) products — those are internal ids, not catalog numbers.
  const itemNumber =
    product.sku && !product.sku.startsWith('custom-') ? product.sku : null;

  const cardClassName =
    'group flex flex-col overflow-hidden rounded border border-border bg-brand-white transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2';

  const cardInner = (
    <>
      <div className="relative aspect-square overflow-hidden bg-bg-soft">
        {imageSrc ? (
          <ProductImage
            src={imageSrc}
            alt={product.name}
            width={IMAGE_W}
            height={IMAGE_H}
            priority={priority}
            className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
            No image
          </div>
        )}

        {product.brand && (
          <span className="absolute left-2 top-2 max-w-[60%] truncate rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-ink shadow-sm">
            {product.brand}
          </span>
        )}

        {ribbon && (
          <span
            className={cn(
              'absolute right-2 top-2 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm',
              ribbon.className,
            )}
          >
            {ribbon.label}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-text-primary group-hover:text-brand-red">
          {product.name}
        </h3>

        {itemNumber && (
          <p className="text-xs text-text-muted">Item # {itemNumber}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex flex-col">
            {price && (
              <span className="text-base font-semibold text-brand-ink">{price}</span>
            )}
            {product.min_qty != null && (
              <span className="text-xs text-text-muted">Min Qty: {product.min_qty}</span>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (detailHref) {
    return (
      <Link href={detailHref} className={cardClassName}>
        {cardInner}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer sponsored" className={cardClassName}>
      {cardInner}
    </a>
  );
}

import { affiliateUrl } from '@/lib/affiliate-url';
import { cn } from '@/lib/utils';
import type { GeigerProduct } from '@/lib/categories';

interface ProductCardProps {
  product: GeigerProduct;
  priority?: boolean;
}

const IMAGE_W = 275;
const IMAGE_H = 275;

function decodeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, '&');
}

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
  const href = affiliateUrl(product.geiger_url);
  const imageSrc = decodeImageUrl(product.imageUrl);
  const price = priceLabel(product.low_price, product.high_price);
  const ribbon = pickRibbon(product);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group flex flex-col overflow-hidden rounded border border-border bg-brand-white transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
    >
      <div className="relative aspect-square overflow-hidden bg-bg-soft">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={product.name}
            width={IMAGE_W}
            height={IMAGE_H}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
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
    </a>
  );
}

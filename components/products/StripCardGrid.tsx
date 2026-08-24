import { ProductCard } from '@/components/category/ProductCard';
import type { StripCard } from '@/lib/products/strip-cards';
import { ManualStripCard } from './ManualStripCard';

/**
 * The card grid every product strip renders (SNIP-150): the same four-column
 * grid the blog body, page-builder ProductStrip and video strip each carried
 * inline, fed by the cards `resolveStripCards` decided. Product cards go
 * through the shared ProductCard (so pricing, affiliate / internal URLs and
 * badges are exactly what every other grid shows); manual cards through
 * ManualStripCard. Renders nothing for an empty list so callers can keep their
 * own "no cards, no section" guard.
 */
export function StripCardGrid({ cards }: { cards: readonly StripCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {cards.map((card) =>
        card.kind === 'product' ? (
          <ProductCard key={card.key} product={card.product} />
        ) : (
          <ManualStripCard key={card.key} card={card} />
        ),
      )}
    </div>
  );
}

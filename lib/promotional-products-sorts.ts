/**
 * Client-safe sort options for /promotional-products.
 *
 * Kept OUT of lib/promotional-products.ts (which is `server-only` and reads the
 * catalog via node:fs) so the client `PromoSortSelect` can import the sort
 * labels without dragging the server catalog into the browser bundle — importing
 * the server lib from a client component fails the Turbopack build.
 */

export type PromoSort = 'featured' | 'price-asc' | 'price-desc' | 'minqty-asc';

export const PROMO_SORTS: { value: PromoSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'minqty-asc', label: 'Min Qty: Low to High' },
];

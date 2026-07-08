/**
 * Client-safe product types + shared constants.
 * Lives in its own module so client components can import without dragging in
 * node:fs / node:path from lib/categories.ts.
 */

export const PRODUCTS_PER_PAGE = 60;

export interface ProductBadge {
  tag: string;
  value: string;
}

export interface GeigerProduct {
  sku: string;
  name: string;
  brand: string | null;
  low_price: number | null;
  high_price: number | null;
  msrp: number | null;
  min_qty: number | null;
  imageUrl: string | null;
  description: string | null;
  category_paths: string[];
  badges: ProductBadge[];
  is_new_item: boolean;
  is_on_sale: boolean;
  product_type_unigram: string | null;
  geiger_url: string | null;
  /**
   * Internal detail-page route (`/products/<slug>`) for products that have one
   * (Sanity `productPage` docs, P2-CP-001). When set, ProductCard links HERE
   * (same tab, no `sponsored` rel) instead of the affiliate URL. Absent for
   * scraped Geiger products and `customProduct` docs — those keep the affiliate
   * link behavior unchanged.
   */
  detailUrl?: string;
}

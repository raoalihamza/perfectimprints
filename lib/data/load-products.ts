// TODO: M3-302 - Implement product loader.
// Reads data/geiger/products.json once at build time and exposes typed accessors
// for category grids, individual cards, and featured/new product feeds.

export interface Product {
  sku: string;
  name: string;
  brand?: string | null;
  low_price?: number | null;
  high_price?: number | null;
  msrp?: number | null;
  min_qty?: number | null;
  imageUrl?: string | null;
  description?: string | null;
  category_paths: string[];
  badges?: string[];
  is_new_item?: boolean;
  is_on_sale?: boolean;
  product_type_unigram?: string | null;
  geiger_url?: string | null;
}

export async function loadProductsBySkus(_skus: string[]): Promise<Product[]> {
  // TODO M3-302
  return [];
}

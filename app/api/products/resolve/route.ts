// SKU -> product-info resolver for Studio inputs (M5-504 Part 2; extended in
// Q-130 for the quote builder).
//
// Resolves a Geiger SKU live from data/geiger/products.json via
// `resolveProductsBySku`, so it tracks the monthly re-scrape. Two consumers:
//
//   - SkuPreview (productPlacement.sku) - reads found/name/brand only.
//   - The quote builder's Geiger line (sanity/components/QuoteLineInputs.tsx) -
//     also reads description (truncated into the line), plus lowPrice /
//     highPrice / minQty which are shown as REFERENCE FIGURES beside the cost
//     field. Geiger publishes a price RANGE, never a real cost, so these must
//     never be written into a quote's unit cost (Q-000).
//
// Q-130 only ADDED fields, so the existing consumer is unaffected.
//
// Read-only, no auth: every field here is public catalog data that already
// ships in the client-side search index and renders on the public product
// cards (name, brand, image, price range, minimum quantity). The catalog file
// itself is far too large for the Studio bundle, which is why this route
// exists rather than a client-side lookup.

import { NextResponse } from 'next/server';
import { resolveProductsBySku } from '@/lib/categories';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = (searchParams.get('sku') || '').trim();
  if (!sku) {
    return NextResponse.json({ found: false, error: 'Missing sku.' }, { status: 400 });
  }
  const [product] = resolveProductsBySku([sku]);
  if (!product) {
    return NextResponse.json({ found: false, sku });
  }
  return NextResponse.json({
    found: true,
    sku: product.sku,
    name: product.name,
    brand: product.brand ?? null,
    imageUrl: product.imageUrl ?? null,
    // Added in Q-130 for the quote builder.
    description: product.description ?? null,
    lowPrice: product.low_price ?? null,
    highPrice: product.high_price ?? null,
    minQty: product.min_qty ?? null,
  });
}

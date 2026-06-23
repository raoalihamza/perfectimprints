// SKU → product-name resolver for the Studio SkuPreview component (M5-504 Part 2).
//
// Resolves a Geiger SKU to its product name (+ thumbnail) live from
// data/geiger/products.json via `resolveProductsBySku`, so Patrick can confirm
// he typed the right SKU. Read-only, no auth — exposes only public catalog data
// that already ships in the search index.

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
  });
}

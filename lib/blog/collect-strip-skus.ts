/**
 * The Geiger SKUs a blog body's product strips name, in reading order, each
 * once (AUTO-202: moved verbatim from app/blog/[slug]/page.tsx so the header
 * image code, which feeds those products' photographs to the image model,
 * reads the body exactly as the page does). Pure: no Sanity, no fs, safe in
 * the Studio bundle.
 *
 * Entries can also be dereferenced productPage/customProduct refs (which
 * carry no `sku` here) or null (a dangling ref); both are skipped. Only
 * blogProduct SKU entries feed the catalog lookup.
 */
export function collectBlogProductSkus(body: readonly unknown[] | undefined | null): string[] {
  if (!body) return [];
  const skus: string[] = [];
  const seen = new Set<string>();
  for (const block of body) {
    const b = block as { _type?: string; products?: ({ sku?: unknown } | null)[] } | null;
    if (!b || b._type !== 'blogProducts') continue;
    for (const entry of b.products ?? []) {
      const sku = typeof entry?.sku === 'string' ? entry.sku.trim() : '';
      if (sku && !seen.has(sku)) {
        seen.add(sku);
        skus.push(sku);
      }
    }
  }
  return skus;
}

/**
 * Client-safe rush-products filter logic.
 * Pure types + the in-memory filter function used by the RushProductsClient UI.
 * Kept separate from lib/rush-products.ts (which reads rush-products.json via
 * node:fs) so client components can import it without dragging server-only
 * modules into the browser bundle.
 *
 * Mirrors lib/new-products-filter.ts field-for-field; the only difference is naming.
 */

import type { GeigerProduct } from './product-types';

export interface RushProductsFacetValue {
  id: string;
  value: string | null;
  label: string;
  count: number;
  type: 'value' | 'range';
  low: string | null;
  high: string | null;
  skus: string[];
}

export interface RushProductsFacetSection {
  field: string;
  label: string;
  type: string;
  values: RushProductsFacetValue[];
}

export type RushProductsFilterState = Record<string, string[]>;

/**
 * OR within a section, AND across sections — standard ecommerce semantics.
 * Pure function: no I/O, no globals.
 */
export function applyRushProductsFilters(
  products: GeigerProduct[],
  facets: RushProductsFacetSection[],
  state: RushProductsFilterState,
): GeigerProduct[] {
  let activeCount = 0;
  for (const k of Object.keys(state)) activeCount += state[k]?.length || 0;
  if (activeCount === 0) return products;

  const sectionByField = new Map<string, RushProductsFacetSection>();
  for (const f of facets) sectionByField.set(f.field, f);

  let allowed: Set<string> | null = null;
  for (const [field, selectedIds] of Object.entries(state)) {
    if (selectedIds.length === 0) continue;
    const section = sectionByField.get(field);
    if (!section) continue;
    const union = new Set<string>();
    for (const id of selectedIds) {
      const v = section.values.find((x) => x.id === id);
      if (!v) continue;
      for (const sku of v.skus) union.add(sku);
    }
    if (allowed === null) {
      allowed = union;
    } else {
      const next = new Set<string>();
      for (const sku of union) if (allowed.has(sku)) next.add(sku);
      allowed = next;
    }
    if (allowed.size === 0) return [];
  }

  if (allowed === null) return products;
  const allowedSet = allowed;
  return products.filter((p) => allowedSet.has(p.sku));
}

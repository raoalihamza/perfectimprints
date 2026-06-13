/**
 * Client-safe deals filter logic.
 * Pure types + the in-memory filter function used by the DealsClient UI. Kept
 * separate from lib/deals.ts (which reads deals.json via node:fs) so client
 * components can import it without dragging server-only modules into the
 * browser bundle.
 */

import type { GeigerProduct } from './product-types';

export interface DealsFacetValue {
  id: string; // URL-friendly id (also used as client-side selection key)
  value: string | null;
  label: string;
  count: number;
  type: 'value' | 'range';
  low: string | null;
  high: string | null;
  skus: string[];
}

export interface DealsFacetSection {
  field: string; // Searchspring field name, e.g. "colors", "low_price"
  label: string; // Display label, e.g. "Color", "Price"
  type: string; // "list" | "range" | "hierarchy"
  values: DealsFacetValue[];
}

/** Map field name -> selected value ids. */
export type DealsFilterState = Record<string, string[]>;

/**
 * OR within a section, AND across sections — standard ecommerce semantics.
 * Pure function: no I/O, no globals.
 */
export function applyDealsFilters(
  products: GeigerProduct[],
  facets: DealsFacetSection[],
  state: DealsFilterState,
): GeigerProduct[] {
  let activeCount = 0;
  for (const k of Object.keys(state)) activeCount += state[k]?.length || 0;
  if (activeCount === 0) return products;

  const sectionByField = new Map<string, DealsFacetSection>();
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

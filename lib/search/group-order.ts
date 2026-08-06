/**
 * Grouped-dropdown display order for the search overlay (client-safe, pure).
 *
 * Extracted from SearchBox so the Q-180 improvement-3 rule - the blog index
 * shows the Blogs group first, the video index the Videos group first - lives
 * in one testable place. Presentation only: which items match, their ranking,
 * and the per-group caps never change here; only the order the GROUPS render in.
 */

import type { SearchItemType } from './types';

export interface SearchGroupDef {
  type: SearchItemType;
  cap: number;
  heading: string;
}

/** Default display order + per-group caps for the grouped dropdown. */
export const SEARCH_GROUP_ORDER: SearchGroupDef[] = [
  { type: 'category', cap: 4, heading: 'Categories' },
  { type: 'product', cap: 6, heading: 'Products' },
  { type: 'brand', cap: 3, heading: 'Brands' },
  { type: 'blog', cap: 3, heading: 'Blogs' },
  { type: 'video', cap: 3, heading: 'Videos' },
  { type: 'faq', cap: 3, heading: 'FAQs' },
];

/**
 * The group order with `priorityType` lifted to the front (Q-180). No priority
 * (the header box) returns the default order unchanged; every other group keeps
 * its existing relative order.
 */
export function orderedSearchGroups(priorityType?: SearchItemType): SearchGroupDef[] {
  if (!priorityType) return SEARCH_GROUP_ORDER;
  return [
    ...SEARCH_GROUP_ORDER.filter((g) => g.type === priorityType),
    ...SEARCH_GROUP_ORDER.filter((g) => g.type !== priorityType),
  ];
}

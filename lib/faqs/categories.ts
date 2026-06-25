/**
 * Canonical FAQ-library taxonomy (M5-506). Ordered — drives the section order
 * on /faq, the section anchor ids (`/faq#<value>`), and the seed script.
 *
 * Dependency-free so it's safe to import from the Next app (page + query),
 * the seed script (Node/tsx), and tests. The Sanity `faq` schema mirrors this
 * SAME list inline in its `faqCategory` option list (the standalone Studio
 * bundler can't import from `lib/`), so KEEP THE TWO IN SYNC — see
 * sanity/schemas/documents/faq.ts.
 */

export interface FaqCategory {
  /** Stable value stored on the faq doc + used as the /faq section anchor id. */
  value: string;
  title: string;
}

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  { value: 'product-selection', title: 'Product Selection & Availability' },
  { value: 'ordering-quotes-minimums', title: 'Ordering, Quotes & Minimums' },
  { value: 'artwork-proofs-branding', title: 'Artwork, Proofs & Branding' },
  { value: 'production-rush-delivery', title: 'Production, Rush Orders & Delivery' },
  { value: 'company-stores-kitting-programs', title: 'Company Stores, Kitting & Custom Programs' },
  { value: 'order-changes-cancellations-problems', title: 'Order Changes, Cancellations & Problems' },
  { value: 'getting-started', title: 'Getting Started' },
];

export const FAQ_CATEGORY_VALUES: ReadonlySet<string> = new Set(
  FAQ_CATEGORIES.map((c) => c.value),
);

export function faqCategoryTitle(value: string | undefined): string | undefined {
  return FAQ_CATEGORIES.find((c) => c.value === value)?.title;
}

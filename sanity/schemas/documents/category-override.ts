import { defineField, defineType } from 'sanity';

/**
 * Per-category curation override (M5-504 part 1).
 *
 * Keyed by the `/cat/...` URL slug (the path AFTER `/cat/`). Gives Patrick a
 * manual escape hatch on top of the automatic Geiger-menu product-bearing rule:
 * force a category to CTA, force it to show products, hide individual scraped
 * SKUs, or add SKUs / custom products. The render path applies these through
 * the same hide/pin/add augment layer that /deals, /new-products, and
 * /rush-products already use.
 *
 * Precedence at render time (highest first):
 *   forceCTA → forceProducts → Geiger-menu rule → existing CTA rules.
 */
export default defineType({
  name: 'categoryOverride',
  title: 'Category Override',
  type: 'document',
  fields: [
    defineField({
      name: 'categorySlug',
      title: 'Category Slug',
      type: 'string',
      description:
        'The path AFTER /cat/ — e.g. "water-bottles", or "water-bottles/color/blue" for a facet. No leading or trailing slash. This is the key that matches the page being overridden.',
      validation: (Rule) =>
        Rule.required().custom((value) => {
          if (typeof value !== 'string') return 'Required.';
          const v = value.trim();
          if (!v) return 'Required.';
          if (v.startsWith('/') || v.endsWith('/')) return 'No leading or trailing slash.';
          if (v.startsWith('cat/')) return 'Drop the leading "cat/" — just the slug after it.';
          return true;
        }),
    }),
    defineField({
      name: 'forceCTA',
      title: 'Force CTA (hide product grid)',
      type: 'boolean',
      initialValue: false,
      description:
        'Highest priority. When on, this category always renders the lead-form CTA instead of a product grid, regardless of how many products it has.',
    }),
    defineField({
      name: 'forceProducts',
      title: 'Force Products (always show grid)',
      type: 'boolean',
      initialValue: false,
      description:
        'Escape hatch for the automatic rule. When on, this category shows a product grid even if the Geiger-menu rule would make it CTA-only. Ignored when Force CTA is also on. Combine with Added SKUs / Added Products below to populate an otherwise-empty category.',
    }),
    defineField({
      name: 'hiddenSkus',
      title: 'Hidden SKUs',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description:
        'Geiger SKUs to remove from this category grid. Same blocklist mechanism as /deals hiddenDealSkus.',
    }),
    defineField({
      name: 'addedSkus',
      title: 'Added SKUs',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description:
        'Existing Geiger SKUs (from data/geiger/products.json) to prepend to this category grid, even if Geiger does not file them under it. Resolved against the full catalog; unknown SKUs are skipped.',
    }),
    defineField({
      name: 'addedProducts',
      title: 'Added Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'customProduct' }] }],
      description:
        'Custom (non-Geiger) products to prepend to this category grid. Same customProduct documents used by /deals and /new-products.',
    }),
  ],
  preview: {
    select: {
      slug: 'categorySlug',
      forceCTA: 'forceCTA',
      forceProducts: 'forceProducts',
    },
    prepare({ slug, forceCTA, forceProducts }) {
      const tags: string[] = [];
      if (forceCTA) tags.push('Force CTA');
      else if (forceProducts) tags.push('Force Products');
      return {
        title: slug ? `/cat/${slug}` : '(no slug)',
        subtitle: tags.length ? tags.join(' · ') : 'SKU edits only',
      };
    },
  },
});

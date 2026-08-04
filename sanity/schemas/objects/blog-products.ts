import { defineArrayMember, defineField, defineType } from 'sanity';
import { ProductSkuInput } from '../../components/ProductPicker';

/**
 * The shared `of` members for EVERY product strip array — the blog body's
 * `blogProducts` block, the page-builder `productStrip` section,
 * `landingPage.relatedProducts`, and `video.relatedProducts` (Patrick feedback
 * 2026-07-11: the strips previously took only a Geiger SKU / manual card).
 * Mirrors `productPage.relatedProducts`: alongside the `blogProduct` entry,
 * editors can reference one of their own Product Pages (renders as an internal
 * card linking to /products/<slug>) or Custom Products (affiliate/external
 * card), with live title/price/image from the doc. The reference member is
 * NAMED `relatedProductRef` — Sanity stores the member name as the item's
 * `_type`, which the render projections key on via `defined(_ref)`.
 * Factored here so the four strips can never drift.
 */
export const productStripEntryMembers = [
  defineArrayMember({ type: 'blogProduct' }),
  defineArrayMember({
    type: 'reference',
    name: 'relatedProductRef',
    title: 'Custom Product / Product Page',
    to: [{ type: 'customProduct' }, { type: 'productPage' }],
  }),
];

/** Shared field description for the strip arrays (kept in one place). */
export const productStripEntryDescription =
  'Add a Geiger product by SKU (the "Product" entry — prices and links pull live from the catalog), or reference one of your own Product Pages (links to its /products page) or Custom Products (links to its external URL). Manual title/image/URL fields on the "Product" entry are the fallback when no SKU is set.';

/**
 * A single product entry — SKU-backed (live data pulled from the Geiger catalog
 * at render time) or fully manual (title + image + url). Registered as a named
 * type (P2-AI-003) so it is reusable outside the blog body's `blogProducts`
 * block, e.g. `video.relatedProducts`. It was previously defined inline inside
 * `blogProducts`; the stored `_type` ('blogProduct') is unchanged, so existing
 * blog data is untouched.
 */
export const blogProduct = defineType({
  name: 'blogProduct',
  title: 'Product',
  type: 'object',
  fields: [
    // Q-170 improvement 1: search-and-pick instead of typing a number from
    // memory. `ProductSkuInput` stores the SAME bare SKU string this field has
    // always held (it emits set(<sku>) / unset(), exactly like the plain string
    // input), so there is NO data migration and every already-stored entry keeps
    // working untouched. Attaching it HERE gives the picker to every surface that
    // uses `blogProduct` at once: blog bodies, the page-builder product strip,
    // video related products, landing-page related products, and productPage
    // related products.
    defineField({
      name: 'sku',
      title: 'Geiger SKU',
      type: 'string',
      components: { input: ProductSkuInput },
      description:
        'Search the Geiger catalog by product name, SKU, or brand and click a result to pick it. When set, the live product (price, image, affiliate URL) is pulled from the catalog by SKU. Manual fields below are only used as a fallback if the SKU is not found.',
    }),
    defineField({
      name: 'title',
      title: 'Title (manual fallback)',
      type: 'string',
    }),
    defineField({
      name: 'image',
      title: 'Image (manual fallback)',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'url',
      title: 'URL (manual fallback)',
      type: 'url',
      description:
        'External link. Geiger URLs are automatically rewritten through the affiliate host.',
    }),
  ],
  preview: {
    select: { sku: 'sku', title: 'title', image: 'image' },
    prepare({ sku, title, image }) {
      return {
        title: title || sku || 'Untitled product',
        subtitle: sku ? `SKU: ${sku}` : 'Manual entry',
        media: image,
      };
    },
  },
});

export default defineType({
  name: 'blogProducts',
  title: 'Products Block',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading (optional)',
      type: 'string',
      description: 'Shown above the product row, e.g. "Premium Insulated Travel Mugs for Doctors".',
    }),
    defineField({
      name: 'products',
      title: 'Products',
      type: 'array',
      of: productStripEntryMembers,
      description: productStripEntryDescription,
    }),
  ],
  preview: {
    select: { heading: 'heading', products: 'products' },
    prepare({ heading, products }) {
      const count = Array.isArray(products) ? products.length : 0;
      return {
        title: heading || 'Products block',
        subtitle: `${count} product${count === 1 ? '' : 's'}`,
      };
    },
  },
});

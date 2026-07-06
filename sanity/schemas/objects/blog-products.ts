import { defineField, defineType } from 'sanity';

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
    defineField({
      name: 'sku',
      title: 'Geiger SKU',
      type: 'string',
      description:
        'When set, the live product (price, image, affiliate URL) is pulled from the Geiger catalog by SKU. Manual fields below are only used as a fallback if the SKU is not found.',
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
      of: [{ type: 'blogProduct' }],
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

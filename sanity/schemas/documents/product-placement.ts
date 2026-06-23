import { defineField, defineType } from 'sanity';
import { CategoryPicker } from '../../components/CategoryPicker';
import { SkuPreview } from '../../components/SkuPreview';

/**
 * Product-side placement (M5-504 Part 2). The product-first complement to
 * `categoryOverride` (which is category-first). Keyed by a Geiger `sku`, it
 * attaches/detaches that product to/from one or many categories. Both documents
 * write to the same underlying truth and are merged by the unified resolver
 * ([lib/sanity/queries/product-placements.ts], removal wins over add).
 *
 * Placements reference products by SKU (never a copy of product data), so they
 * survive the weekly/monthly Geiger re-scrape. A SKU Geiger later discontinues
 * simply resolves to nothing.
 */
export default defineType({
  name: 'productPlacement',
  title: 'Product Placement',
  type: 'document',
  fields: [
    defineField({
      name: 'sku',
      title: 'Geiger SKU',
      type: 'string',
      description: 'The Geiger SKU of the product to place. The product name resolves below for confirmation.',
      validation: (Rule) => Rule.required(),
      components: { input: SkuPreview },
    }),
    defineField({
      name: 'addToCategories',
      title: 'Add to Categories',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Categories where this product should also appear (in addition to where Geiger files it).',
      components: { input: CategoryPicker },
    }),
    defineField({
      name: 'removeFromCategories',
      title: 'Remove from Categories',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Categories where this product should be hidden. Removal wins over add if a category is in both lists.',
      components: { input: CategoryPicker },
    }),
  ],
  preview: {
    select: { sku: 'sku', add: 'addToCategories', remove: 'removeFromCategories' },
    prepare({ sku, add, remove }) {
      const a = Array.isArray(add) ? add.length : 0;
      const r = Array.isArray(remove) ? remove.length : 0;
      return {
        title: sku ? `SKU ${sku}` : '(no SKU)',
        subtitle: `+${a} categor${a === 1 ? 'y' : 'ies'} · -${r}`,
      };
    },
  },
});

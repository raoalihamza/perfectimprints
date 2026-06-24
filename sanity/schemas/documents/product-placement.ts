import { defineField, defineType } from 'sanity';
import { CategoryPicker } from '../../components/CategoryPicker';
import { ProductSkuInput } from '../../components/ProductPicker';

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
      description: 'Search the catalog by product name / SKU / brand and click to pick the product to place.',
      validation: (Rule) => Rule.required(),
      components: { input: ProductSkuInput },
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

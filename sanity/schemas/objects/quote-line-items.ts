import { defineField, defineType } from 'sanity';
import { ProductSkuInput } from '../../components/ProductPicker';

/**
 * The four line-item types a `quote` can contain (Q-110). Patrick picks WHAT
 * he is adding from the array's insert menu instead of filling one generic
 * form:
 *
 *   1. quoteGeigerLine     - a Geiger catalog product picked by SKU
 *   2. quoteOwnProductLine - one of Patrick's own Product Pages (reference)
 *   3. quoteCustomLine     - a fully manual item (own name, image, text)
 *   4. quoteChargeLine     - a non-product charge (art fee, rush fee, ...)
 *
 * The first three share the same commercial fields, defined ONCE below.
 *
 * CRITICAL PRICING DECISION (already made - do not "optimise" this away):
 * the unit cost, setup charge, and shipping on a line are STORED VALUES ON
 * THE QUOTE, never read live from the referenced product at render time. A
 * quote sent to a customer must show the same numbers next week even if
 * Patrick edits the product afterwards - the quote is a commercial snapshot,
 * not a view over live data. Geiger data holds only a price RANGE and never a
 * real cost, so a Geiger line's numbers are always Patrick's own entry; for
 * an own-product line the next prompt adds a helper that PRE-FILLS these
 * fields from the referenced Product Page, after which they are frozen copies
 * like every other line. Totals are NEVER stored either - every surface
 * computes them from these fields via lib/quotes/quote-totals.ts.
 */

/** The commercial fields shared by the three product-shaped line types. */
function commercialFields() {
  return [
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'decorationMethod',
      title: 'Decoration method (optional)',
      type: 'string',
      description:
        'Free text, e.g. "Screen Print, 2 Colors" - a quote may name a decoration no product page defines.',
    }),
    defineField({
      name: 'unitCost',
      title: 'Unit cost (USD)',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
      description:
        'The per-unit price on THIS quote. Stored here and frozen - later edits to the product never change a quote.',
    }),
    defineField({
      name: 'setupCharge',
      title: 'Setup charge (USD, optional)',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      description: 'One-time setup fee for this line. Leave blank (or 0) for none.',
    }),
    defineField({
      name: 'shipping',
      title: 'Shipping for this line (USD, optional)',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      description: 'Shown in the shipping total, not the merchandise subtotal.',
    }),
    defineField({
      name: 'note',
      title: 'Line note (optional)',
      type: 'text',
      rows: 2,
      description: 'Shown under this line on the quote.',
    }),
  ];
}

/** Preview subtitle for a product-shaped line: "100 x $5.00" style. */
function lineSubtitle(quantity?: number, unitCost?: number): string {
  const qty = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null;
  const cost = typeof unitCost === 'number' && Number.isFinite(unitCost) ? unitCost : null;
  if (qty === null && cost === null) return 'No quantity or cost yet';
  return `${qty ?? '?'} x ${cost !== null ? `$${cost.toFixed(2)}` : '$?'}`;
}

const quoteGeigerLine = defineType({
  name: 'quoteGeigerLine',
  title: 'Geiger product',
  type: 'object',
  fields: [
    defineField({
      name: 'sku',
      title: 'Geiger product (SKU)',
      type: 'string',
      components: { input: ProductSkuInput },
      validation: (Rule) => Rule.required(),
      description: 'Search the Geiger catalog by name, SKU, or brand and click to pick.',
    }),
    defineField({
      name: 'displayName',
      title: 'Display name',
      type: 'string',
      validation: (Rule) => Rule.required(),
      description: 'The product name as it should read on the quote.',
    }),
    defineField({
      name: 'imageUrl',
      title: 'Image URL (optional)',
      type: 'url',
      description:
        'A Geiger CDN image link (hot-linked like the rest of the site - Geiger images are never downloaded).',
    }),
    defineField({
      name: 'description',
      title: 'Short description (optional)',
      type: 'text',
      rows: 3,
      description: 'A truncated description shown under the name.',
    }),
    // Geiger data carries only a price RANGE, never a real cost - the unit
    // cost and setup on this line are always entered by Patrick.
    ...commercialFields(),
  ],
  preview: {
    select: { displayName: 'displayName', sku: 'sku', quantity: 'quantity', unitCost: 'unitCost' },
    prepare({ displayName, sku, quantity, unitCost }) {
      return {
        title: displayName || sku || 'Geiger product',
        subtitle: `Geiger ${sku ? `#${sku} - ` : ''}${lineSubtitle(quantity, unitCost)}`,
      };
    },
  },
});

const quoteOwnProductLine = defineType({
  name: 'quoteOwnProductLine',
  title: 'Own product (Product Page)',
  type: 'object',
  fields: [
    defineField({
      name: 'product',
      title: 'Product Page',
      type: 'reference',
      to: [{ type: 'productPage' }],
      validation: (Rule) => Rule.required(),
      description:
        'One of your own Product Pages. Its name and image display from the product; the PRICES below are this quote\'s own frozen copy (a pre-fill helper arrives in the next update).',
    }),
    defineField({
      name: 'displayName',
      title: 'Display name override (optional)',
      type: 'string',
      description: 'Leave blank to show the Product Page title.',
    }),
    ...commercialFields(),
  ],
  preview: {
    select: {
      productTitle: 'product.title',
      displayName: 'displayName',
      quantity: 'quantity',
      unitCost: 'unitCost',
      media: 'product.colorVariants.0.images.0',
    },
    prepare({ productTitle, displayName, quantity, unitCost, media }) {
      return {
        title: displayName || productTitle || 'Own product',
        subtitle: `Own product - ${lineSubtitle(quantity, unitCost)}`,
        media,
      };
    },
  },
});

const quoteCustomLine = defineType({
  name: 'quoteCustomLine',
  title: 'Custom item',
  type: 'object',
  fields: [
    defineField({
      name: 'displayName',
      title: 'Item name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image (optional)',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'description',
      title: 'Short description (optional)',
      type: 'text',
      rows: 3,
    }),
    ...commercialFields(),
  ],
  preview: {
    select: { displayName: 'displayName', quantity: 'quantity', unitCost: 'unitCost', media: 'image' },
    prepare({ displayName, quantity, unitCost, media }) {
      return {
        title: displayName || 'Custom item',
        subtitle: `Custom - ${lineSubtitle(quantity, unitCost)}`,
        media,
      };
    },
  },
});

const quoteChargeLine = defineType({
  name: 'quoteChargeLine',
  title: 'Charge (art fee, rush, ...)',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Charge label',
      type: 'string',
      validation: (Rule) => Rule.required(),
      description: 'e.g. "Art fee", "Second color run", "Rush charge".',
    }),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      initialValue: 1,
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'unitPrice',
      title: 'Price each (USD)',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
  ],
  preview: {
    select: { label: 'label', quantity: 'quantity', unitPrice: 'unitPrice' },
    prepare({ label, quantity, unitPrice }) {
      return {
        title: label || 'Charge',
        subtitle: `Charge - ${lineSubtitle(quantity, unitPrice)}`,
      };
    },
  },
});

export const quoteLineItemTypes = [
  quoteGeigerLine,
  quoteOwnProductLine,
  quoteCustomLine,
  quoteChargeLine,
];

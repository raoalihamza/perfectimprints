import { defineField, defineType } from 'sanity';
import { ProductSkuInput } from '../../components/ProductPicker';
import {
  QuoteGeigerLineInput,
  QuoteOwnProductLineInput,
  QuoteSimpleLineInput,
} from '../../components/QuoteLineInputs';
import { formatUsd, quoteLineTotal } from '../../../lib/quotes/quote-totals';

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
 * real cost, so a Geiger line's numbers are always Patrick's own entry; for an
 * own-product line the Q-130 "Pull details from this product" button COPIES
 * the price in from the referenced Product Page, after which it is a frozen
 * copy like every other line (Q-111 proved the freeze holds). Totals are NEVER
 * stored either - every surface computes them from these fields via
 * lib/quotes/quote-totals.ts.
 *
 * The auto-fill behaviour lives in sanity/components/QuoteLineInputs.tsx, and
 * the rules it follows (what fills, what stays Patrick's to type, what is only
 * a reference figure) live in the pure lib/quotes/quote-prefill.ts.
 */

/** The commercial fields shared by the three product-shaped line types. */
function commercialFields() {
  return [
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      validation: (Rule) =>
        Rule.required().min(1).error('Enter how many of this item the customer wants (at least 1).'),
    }),
    defineField({
      name: 'decorationMethod',
      title: 'Decoration method (optional)',
      type: 'string',
      description:
        'Free text, e.g. "Screen Print, 2 Colors" - a quote may name a decoration no product page defines. On an own-product line, picking one of the product\'s own methods also picks up that method\'s setup charge.',
    }),
    defineField({
      name: 'unitCost',
      title: 'Unit cost (USD)',
      type: 'number',
      validation: (Rule) =>
        Rule.required()
          .min(0)
          .error('Enter the price per unit for this line. Enter 0 if this item is free.'),
      description:
        'The per-unit price on THIS quote. Stored here and frozen - later edits to the product never change a quote.',
    }),
    defineField({
      name: 'setupCharge',
      title: 'Setup charge (USD, optional)',
      type: 'number',
      validation: (Rule) => Rule.min(0).error('A setup charge cannot be a negative amount.'),
      description: 'One-time setup fee for this line. Leave blank (or 0) for none.',
    }),
    defineField({
      name: 'shipping',
      title: 'Shipping for this line (USD, optional)',
      type: 'number',
      validation: (Rule) => Rule.min(0).error('Shipping cannot be a negative amount.'),
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

/**
 * Preview subtitle for a collapsed line, so the row reads like a quote line:
 * "Geiger #501003 - 250 x $3.20 = $890.00". The total comes from the SHARED
 * `quoteLineTotal`, so a collapsed row, the expanded line, the totals box, and
 * every future surface can never disagree. Draft-tolerant by construction:
 * `quoteLineTotal` treats anything missing or unusable as zero and never
 * throws, so a half-filled line still previews.
 */
function lineSubtitle(kind: string, line: Record<string, unknown>, priceField: string): string {
  const quantity = line.quantity;
  const price = line[priceField];
  const qty = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null;
  const cost = typeof price === 'number' && Number.isFinite(price) ? price : null;
  if (qty === null && cost === null) return `${kind} - no quantity or price yet`;
  const amounts = `${qty ?? '?'} x ${cost !== null ? formatUsd(cost) : '$?'}`;
  return `${kind} - ${amounts} = ${formatUsd(quoteLineTotal(line))}`;
}

const quoteGeigerLine = defineType({
  name: 'quoteGeigerLine',
  title: 'Geiger product',
  type: 'object',
  // Q-130: picking a SKU fills the name, image and description automatically,
  // and shows the catalog's price range + minimum as reference figures beside
  // the cost field. It never writes a price. See QuoteLineInputs.tsx.
  components: { input: QuoteGeigerLineInput },
  fields: [
    defineField({
      name: 'sku',
      title: 'Geiger product (SKU)',
      type: 'string',
      components: { input: ProductSkuInput },
      validation: (Rule) => Rule.required().error('Pick the catalog product for this line.'),
      description:
        'Search the Geiger catalog by name, SKU, or brand and click to pick. The name, image and description below fill in automatically.',
    }),
    defineField({
      name: 'displayName',
      title: 'Display name',
      type: 'string',
      validation: (Rule) =>
        Rule.required().error('Give this line a name the customer will recognise.'),
      description: 'The product name as it should read on the quote. Filled in when you pick a SKU.',
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
    select: {
      displayName: 'displayName',
      sku: 'sku',
      quantity: 'quantity',
      unitCost: 'unitCost',
      setupCharge: 'setupCharge',
      shipping: 'shipping',
    },
    prepare({ displayName, sku, quantity, unitCost, setupCharge, shipping }) {
      const line = { _type: 'quoteGeigerLine', quantity, unitCost, setupCharge, shipping };
      return {
        title: displayName || sku || 'Geiger product',
        subtitle: lineSubtitle(`Geiger${sku ? ` #${sku}` : ''}`, line, 'unitCost'),
      };
    },
  },
});

const quoteOwnProductLine = defineType({
  name: 'quoteOwnProductLine',
  title: 'Own product (Product Page)',
  type: 'object',
  // Q-130: "Pull details from this product" copies the name, image,
  // description, the unit cost for THIS line's quantity, and the setup charge
  // for the chosen decoration method. See QuoteLineInputs.tsx.
  components: { input: QuoteOwnProductLineInput },
  fields: [
    defineField({
      name: 'product',
      title: 'Product Page',
      type: 'reference',
      to: [{ type: 'productPage' }],
      validation: (Rule) =>
        Rule.required().error('Choose which of your Product Pages this line is for.'),
      description:
        'One of your own Product Pages. Use "Pull details from this product" above to copy its details in. Everything copied is frozen on this quote - editing the product later never changes a quote you have already built.',
    }),
    defineField({
      name: 'displayName',
      title: 'Display name override (optional)',
      type: 'string',
      description:
        'Leave blank to show the Product Page title. Pulling details fills this in, so the quote keeps reading the same even if you rename the product later.',
    }),
    // Q-130: snapshot copies, filled by the pull action. They exist for the
    // same reason the prices do - a sent quote must not change under the
    // customer when the product page is edited. Blank is fine: the future
    // customer page falls back to the referenced product.
    defineField({
      name: 'imageUrl',
      title: 'Image URL (optional)',
      type: 'url',
      description: 'Filled in when you pull details. Leave blank to use the product\'s own image.',
    }),
    defineField({
      name: 'description',
      title: 'Short description (optional)',
      type: 'text',
      rows: 3,
      description:
        'A truncated description shown under the name. Filled in when you pull details.',
    }),
    ...commercialFields(),
  ],
  preview: {
    select: {
      productTitle: 'product.title',
      displayName: 'displayName',
      quantity: 'quantity',
      unitCost: 'unitCost',
      setupCharge: 'setupCharge',
      shipping: 'shipping',
      media: 'product.colorVariants.0.images.0',
    },
    prepare({ productTitle, displayName, quantity, unitCost, setupCharge, shipping, media }) {
      const line = { _type: 'quoteOwnProductLine', quantity, unitCost, setupCharge, shipping };
      return {
        title: displayName || productTitle || 'Own product',
        subtitle: lineSubtitle('Own product', line, 'unitCost'),
        media,
      };
    },
  },
});

const quoteCustomLine = defineType({
  name: 'quoteCustomLine',
  title: 'Custom item',
  type: 'object',
  // Nothing to look up on a manual item, so this input only adds the line total.
  components: { input: QuoteSimpleLineInput },
  fields: [
    defineField({
      name: 'displayName',
      title: 'Item name',
      type: 'string',
      validation: (Rule) => Rule.required().error('Give this item a name for the quote.'),
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
    select: {
      displayName: 'displayName',
      quantity: 'quantity',
      unitCost: 'unitCost',
      setupCharge: 'setupCharge',
      shipping: 'shipping',
      media: 'image',
    },
    prepare({ displayName, quantity, unitCost, setupCharge, shipping, media }) {
      const line = { _type: 'quoteCustomLine', quantity, unitCost, setupCharge, shipping };
      return {
        title: displayName || 'Custom item',
        subtitle: lineSubtitle('Custom', line, 'unitCost'),
        media,
      };
    },
  },
});

const quoteChargeLine = defineType({
  name: 'quoteChargeLine',
  title: 'Charge (art fee, rush, ...)',
  type: 'object',
  // Nothing to look up on a charge, so this input only adds the line total.
  components: { input: QuoteSimpleLineInput },
  fields: [
    defineField({
      name: 'label',
      title: 'Charge label',
      type: 'string',
      validation: (Rule) => Rule.required().error('Name this charge so the customer knows what it is.'),
      description: 'e.g. "Art fee", "Second color run", "Rush charge".',
    }),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      initialValue: 1,
      validation: (Rule) => Rule.required().min(1).error('Enter how many times this charge applies (at least 1).'),
    }),
    defineField({
      name: 'unitPrice',
      title: 'Price each (USD)',
      type: 'number',
      validation: (Rule) =>
        Rule.required().min(0).error('Enter the amount for this charge. Enter 0 to waive it.'),
    }),
  ],
  preview: {
    select: { label: 'label', quantity: 'quantity', unitPrice: 'unitPrice' },
    prepare({ label, quantity, unitPrice }) {
      const line = { _type: 'quoteChargeLine', quantity, unitPrice };
      return {
        title: label || 'Charge',
        subtitle: lineSubtitle('Charge', line, 'unitPrice'),
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

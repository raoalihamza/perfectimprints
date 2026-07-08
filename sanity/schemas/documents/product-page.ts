import { defineField, defineType } from 'sanity';
import { CategorySlugInput } from '../../components/CategoryPicker';
import { portableBody } from '../objects/page-sections';

/**
 * Custom product DETAIL page (P2-CP-001 part 1). Deliberately SEPARATE from
 * `customProduct` (which stays the simple "link-out promotional card" type):
 * a productPage is a full product Patrick creates from scratch, with its own
 * page at /products/<slug> — a color-variant image gallery, tiered pricing,
 * sale flagging, a rich description, a related-products carousel, and a
 * "Get a Quote" button (no cart, no external link).
 *
 * Surfacing: the product's own detail page, /new-products (when the Visibility
 * toggle is on), related-products carousels, and site search. Deliberately NOT
 * inside /cat category pages.
 *
 * Part 2 (P2-CP-002) replaces the stand-in quote form with the dedicated
 * Get a Quote form.
 */
export default defineType({
  name: 'productPage',
  title: 'Product Page',
  type: 'document',
  fieldsets: [
    { name: 'basics', title: 'Basics', options: { collapsible: true, collapsed: false } },
    {
      name: 'imagesColors',
      title: 'Images & Colors',
      description:
        'Each color variant carries its own image(s); on the page, clicking a color swatch swaps the gallery to that color\'s images. The FIRST variant is what visitors see initially.',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'pricing',
      title: 'Pricing',
      description:
        'Quantity-tier pricing shown as the QTY / PRICE table. The card price range (low–high) is derived from these tiers automatically.',
      options: { collapsible: true, collapsed: false },
    },
    { name: 'details', title: 'Details', options: { collapsible: true, collapsed: false } },
    {
      name: 'filters',
      title: 'Filters (optional tags)',
      description:
        'Use the same value names Geiger uses so this product participates in the New Products filters alongside scraped products. Colors are taken automatically from the color variants above.',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'related',
      title: 'Related products',
      description:
        'Drives the "Related Products" carousel at the bottom of the page: automatic matches from the category/keywords, plus anything you add manually.',
      options: { collapsible: true, collapsed: true },
    },
    { name: 'visibility', title: 'Visibility & SEO', options: { collapsible: true, collapsed: true } },
    // AI generation inputs (P2-CP follow-up). Studio-only: consumed ONLY by the
    // "Generate Product Details with AI" action + /api/sanity/generate-product —
    // never read by any render path or the revalidate webhook.
    {
      name: 'ai',
      title: 'AI generation (drafting helper — not shown on the live page)',
      description:
        'Fill the Title above (plus optionally keywords here), click "Generate Product Details with AI" (near Publish), then review what it drafts: the Product details description (with internal links), the SEO meta, related keywords + category, and decoration-method suggestions. It NEVER touches your pricing, images, colors, or sizes. Nothing here renders on the live site.',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    // ---- Basics ----
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      fieldset: 'basics',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      fieldset: 'basics',
      description: 'The page address: /products/<slug>. Click "Generate" to fill it from the title.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.required().custom((slug?: { current?: string }) => {
          const current = slug?.current;
          if (!current) return true; // required() covers the empty case
          // /products/[slug] is a SINGLE-segment route — a slash-containing slug
          // would publish fine but 404 forever (the app/[slug] lesson).
          if (current.includes('/')) return 'The slug must be a single segment — no slashes.';
          if (current !== current.toLowerCase()) return 'Use lowercase letters only.';
          return true;
        }),
    }),
    defineField({
      name: 'brand',
      title: 'Brand (optional)',
      type: 'string',
      fieldset: 'basics',
      description: 'Shown on the product card and used by search and the Brand filter.',
    }),
    {
      ...portableBody('description', 'Product details / description'),
      fieldset: 'details',
      description:
        'The main description: bullets, specs (size, imprint area, FOB point…), headings, bold, and links all work here.',
    },
    defineField({
      name: 'decorationMethods',
      title: 'Decoration methods (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'details',
      description: 'e.g. "Pad Print", "Screen Print", "Laser Engraving" — type one and press ENTER.',
    }),
    defineField({
      name: 'sizes',
      title: 'Sizes (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'details',
      description:
        'Available sizes, listed on the page (e.g. S, M, L, XL). Sizes do NOT change the price or the images.',
    }),
    defineField({
      name: 'productionTime',
      title: 'Production time in days (optional)',
      type: 'number',
      fieldset: 'details',
    }),

    // ---- Images & Colors ----
    defineField({
      name: 'colorVariants',
      title: 'Color variants',
      type: 'array',
      fieldset: 'imagesColors',
      of: [
        {
          type: 'object',
          name: 'productColorVariant',
          title: 'Color variant',
          fields: [
            defineField({
              name: 'colorName',
              title: 'Color name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'swatchHex',
              title: 'Swatch color (optional)',
              type: 'string',
              description:
                'A hex color for the clickable swatch, e.g. #1E3A8A. Leave blank to show the color name as a text chip instead.',
              validation: (Rule) =>
                Rule.custom((value?: string) => {
                  if (!value) return true;
                  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
                    ? true
                    : 'Enter a hex color like #1E3A8A (or leave blank).';
                }),
            }),
            defineField({
              name: 'images',
              title: 'Images for this color',
              type: 'array',
              of: [
                {
                  type: 'image',
                  options: { hotspot: true },
                  fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
                },
              ],
              validation: (Rule) => Rule.max(10).warning('Keep it to 10 images per color.'),
            }),
          ],
          preview: {
            select: { title: 'colorName', media: 'images.0' },
            prepare({ title, media }) {
              return { title: title || 'Color variant', media };
            },
          },
        },
      ],
      description:
        'One entry per color. The first variant\'s images show by default; visitors click a swatch to see the other colors.',
    }),
    defineField({
      name: 'defaultImages',
      title: 'Default images (no color variants)',
      type: 'array',
      fieldset: 'imagesColors',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
        },
      ],
      validation: (Rule) => Rule.max(10).warning('Keep it to 10 images.'),
      description:
        'Used when the product has no color variants (or as a fallback if the variants have no images).',
    }),

    // ---- Pricing ----
    defineField({
      name: 'pricingTiers',
      title: 'Pricing tiers',
      type: 'array',
      fieldset: 'pricing',
      of: [
        {
          type: 'object',
          name: 'pricingTier',
          title: 'Tier',
          fields: [
            defineField({
              name: 'minQty',
              title: 'Quantity (from)',
              type: 'number',
              validation: (Rule) => Rule.required().min(1),
            }),
            defineField({
              name: 'price',
              title: 'Price each (USD)',
              type: 'number',
              validation: (Rule) => Rule.required().positive(),
            }),
          ],
          preview: {
            select: { minQty: 'minQty', price: 'price' },
            prepare({ minQty, price }) {
              return { title: `${minQty ?? '?'}+ → $${price ?? '?'}` };
            },
          },
        },
      ],
      validation: (Rule) => Rule.max(5).warning('Up to 5 pricing tiers are shown.'),
      description: 'Up to 5 tiers, e.g. 100 → $4.99, 250 → $4.49, 500 → $3.99.',
    }),
    defineField({
      name: 'minQty',
      title: 'Minimum quantity (optional)',
      type: 'number',
      fieldset: 'pricing',
      description: 'Leave blank to use the lowest pricing-tier quantity automatically.',
    }),
    defineField({
      name: 'setupCharge',
      title: 'Setup charge (USD, optional)',
      type: 'number',
      fieldset: 'pricing',
      validation: (Rule) => Rule.min(0),
      description:
        'One-time flat setup/decoration charge (e.g. a screen or pad-print setup fee) added on top of quantity × unit price in the on-page ESTIMATED total. Leave blank for no setup charge. The estimate is clearly labeled as an estimate — final pricing is always confirmed in the quote.',
    }),
    defineField({
      name: 'onSale',
      title: 'On sale',
      type: 'boolean',
      initialValue: false,
      fieldset: 'pricing',
      description: 'Shows the "Sale!" badge on the page and the SALE ribbon on product cards.',
    }),
    defineField({
      name: 'salePercentOff',
      title: 'Percent off (optional)',
      type: 'number',
      fieldset: 'pricing',
      validation: (Rule) => Rule.min(1).max(99),
      description: 'Shown next to the sale badge, e.g. 20 → "20% off". Only used when On sale is on.',
    }),
    defineField({
      name: 'saleExpires',
      title: 'Sale pricing expires (optional)',
      type: 'date',
      fieldset: 'pricing',
      description: 'Shown as "Sale pricing expires …". Only used when On sale is on.',
    }),

    // ---- Filters (mirror customProduct so it participates in matching/search) ----
    defineField({
      name: 'material',
      title: 'Material',
      type: 'string',
      fieldset: 'filters',
      description: 'e.g. "Stainless Steel". Participates in the Material filter on /new-products.',
    }),
    defineField({
      name: 'features',
      title: 'Features',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'filters',
      description: 'Same feature names Geiger uses (e.g. "With A Lid") — type a tag and press ENTER.',
    }),
    defineField({
      name: 'types',
      title: 'Types',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'filters',
      description: 'Same type names Geiger uses (e.g. "Tumblers") — type a tag and press ENTER.',
    }),
    defineField({
      name: 'madeInUsa',
      title: 'Made in USA',
      type: 'boolean',
      initialValue: false,
      fieldset: 'filters',
    }),
    defineField({
      name: 'ecoFriendly',
      title: 'Eco-Friendly',
      type: 'boolean',
      initialValue: false,
      fieldset: 'filters',
    }),
    defineField({
      name: 'closeout',
      title: 'Closeout',
      type: 'boolean',
      initialValue: false,
      fieldset: 'filters',
      description: 'Shows the CLOSEOUT ribbon and puts the product under the Closeout/Deals filter.',
    }),

    // ---- Related ----
    defineField({
      name: 'relatedCategorySlug',
      title: 'Related category (optional)',
      type: 'string',
      fieldset: 'related',
      components: { input: CategorySlugInput },
      description:
        'Search and pick the category whose products should fill the Related Products carousel automatically.',
    }),
    defineField({
      name: 'relatedKeywords',
      title: 'Related keywords (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'related',
      description:
        'Plural keywords (e.g. "custom water bottles") that steer the automatic related-products matching. Blank = the product title is used.',
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related products (manual)',
      type: 'array',
      fieldset: 'related',
      of: [
        { type: 'blogProduct' },
        {
          type: 'reference',
          name: 'relatedProductRef',
          title: 'Custom Product / Product Page',
          to: [{ type: 'customProduct' }, { type: 'productPage' }],
        },
      ],
      description:
        'Pinned to the FRONT of the carousel, before the automatic matches. Add a Geiger product by SKU (the "Product" entry), or reference one of your own Custom Products / Product Pages.',
    }),

    // ---- Visibility & SEO ----
    defineField({
      name: 'showInNewProducts',
      title: 'Show on /new-products',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
      description: 'When on, this product appears at the top of the New Products page.',
    }),
    defineField({
      name: 'leadRecipient',
      title: 'Lead recipient email',
      type: 'string',
      fieldset: 'visibility',
      description:
        "Get-a-Quote requests from THIS product's page go to this email (the customer also gets an automatic confirmation copy of their submission). Blank or invalid falls back to patrick@perfectimprints.com.",
      initialValue: 'patrick@perfectimprints.com',
      validation: (Rule) =>
        Rule.custom((value?: string) => {
          if (!value) return true;
          return /^\S+@\S+\.\S+$/.test(value) ? true : 'Enter a valid email address.';
        }),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      fieldset: 'visibility',
    }),

    // -----------------------------------------------------------------------
    // AI generation inputs/outputs — see the fieldset note above.
    // -----------------------------------------------------------------------
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'ai',
      description:
        'Optional. A few plural keywords (e.g. "custom travel tumblers") that steer the AI description, the related products, and the internal links. The product Title is the main input.',
    }),
    defineField({
      name: 'aiSuggestedLinks',
      title: 'Suggested Internal Links',
      type: 'array',
      fieldset: 'ai',
      description:
        'Internal links the AI found and whether each was placed in the description. Not shown on the live page.',
      of: [
        {
          type: 'object',
          name: 'aiSuggestedLink',
          fields: [
            { name: 'label', title: 'Label', type: 'string' },
            { name: 'href', title: 'URL', type: 'string' },
            { name: 'reason', title: 'Why suggested', type: 'string' },
          ],
          preview: {
            select: { title: 'label', subtitle: 'href' },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      slug: 'slug.current',
      variantImage: 'colorVariants.0.images.0',
      defaultImage: 'defaultImages.0',
      onSale: 'onSale',
    },
    prepare({ title, slug, variantImage, defaultImage, onSale }) {
      return {
        title: title || 'Untitled product page',
        subtitle: `${slug ? `/products/${slug}` : 'no slug yet'}${onSale ? ' · SALE' : ''}`,
        media: variantImage || defaultImage,
      };
    },
  },
});

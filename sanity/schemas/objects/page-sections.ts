import { defineField, defineType } from 'sanity';
import { productStripEntryDescription, productStripEntryMembers } from './blog-products';

/**
 * Reusable page-builder section objects (M5-506b).
 *
 * Each section is a polymorphic entry in a `page.sections[]` array, giving
 * Patrick website-builder behavior in Studio: reorder, insert any type, delete,
 * and hide-without-deleting (every section has a `hidden` boolean).
 *
 * These are intentionally generic so the same `page` type can power Services,
 * About, Privacy, Terms, Contact, etc. Nothing here is services-specific.
 *
 * Image fields are paired: a Sanity `image` (preferred, so Patrick can upload /
 * replace / crop) plus an optional `imageUrl` string fallback for hot-linked
 * sources. Renderers prefer the Sanity asset and fall back to the URL.
 */

const hiddenField = defineField({
  name: 'hidden',
  title: 'Hidden',
  type: 'boolean',
  description: 'Hide this section on the live site without deleting it.',
  initialValue: false,
});

function imageField(name = 'image', title = 'Image') {
  return defineField({
    name,
    title,
    type: 'image',
    options: { hotspot: true },
    fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
  });
}

function imageUrlField(name = 'imageUrl', title = 'Image URL (fallback)') {
  return defineField({
    name,
    title,
    type: 'url',
    description: 'Optional. Used only when no uploaded image is set above.',
  });
}

// Rich-text body. Besides the standard block editor (headings, sub-headings,
// paragraphs, bullet/numbered lists, bold/italic, quotes, links) it also accepts
// INLINE images, so an editor can drop a picture between paragraphs — not only as
// a separate Image section. Inline images render via the `image` handler in
// components/page-sections/portable-text.tsx.
// Exported (P2-AI-005) so the `landingPage` schema reuses the EXACT same body
// field shape — its bodies render through the same pagePortableComponents and
// are built by the same buildPageBody/buildPageSectionsBody.
// The link annotation is declared explicitly (P2-CP follow-up) so it carries an
// "Open in new tab" toggle in the Studio link popover — page/landing/productPage
// descriptions all share it; AI-placed links default the toggle ON (the 'page'
// link-shape in lib/ai/place-internal-links.ts), manual links default OFF.
// Existing `{_type:'link', href}` data stays valid (the new field is optional).
export const portableBody = (name = 'body', title = 'Content') =>
  defineField({
    name,
    title,
    type: 'array',
    of: [
      {
        type: 'block',
        marks: {
          annotations: [
            {
              name: 'link',
              type: 'object',
              title: 'Link',
              fields: [
                defineField({
                  name: 'href',
                  title: 'URL',
                  type: 'string',
                  description: 'External URL or an internal path like /rush-products.',
                  validation: (Rule) => Rule.required(),
                }),
                defineField({
                  name: 'openInNewTab',
                  title: 'Open in new tab',
                  type: 'boolean',
                  initialValue: false,
                }),
              ],
            },
          ],
        },
      },
      {
        type: 'image',
        title: 'Inline image',
        options: { hotspot: true },
        fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
      },
    ],
  });

function previewWithHidden(typeLabel: string) {
  return {
    prepare(input: Record<string, unknown>) {
      const heading =
        (input.heading as string) ||
        (input.statText as string) ||
        (input.title as string) ||
        typeLabel;
      const hidden = input.hidden ? ' · hidden' : '';
      return { title: `${typeLabel}: ${heading}`.trim(), subtitle: `Section${hidden}` };
    },
  };
}

export const heroBanner = defineType({
  name: 'heroBanner',
  title: 'Hero Banner',
  type: 'object',
  fields: [
    imageField('image', 'Background / banner image'),
    imageUrlField(),
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'subheading', title: 'Subheading', type: 'text', rows: 2 }),
    defineField({
      name: 'overlayText',
      title: 'Overlay text on image',
      type: 'boolean',
      description:
        'On = heading/subheading render on top of the image (overlay banner). Off = heading/subheading/CTA on top, with the full banner image below.',
      initialValue: true,
    }),
    defineField({ name: 'ctaLabel', title: 'CTA label', type: 'string' }),
    defineField({ name: 'ctaHref', title: 'CTA link', type: 'string' }),
    defineField({
      name: 'ctaFormSlug',
      title: 'CTA opens a form (form slug)',
      type: 'string',
      description:
        'Optional (P2-FB-001). Enter a Form document’s slug (see Forms in Studio, e.g. "kitting-quote") to open that form in a popup instead of following the CTA link. The link above stays as the fallback if the form is unpublished.',
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Hero') },
});

export const richText = defineType({
  name: 'richText',
  title: 'Rich Text',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'anchorId',
      title: 'Anchor ID (optional)',
      type: 'string',
      description: 'If set, this section becomes an in-page jump target (e.g. "kitting" → linkable as #kitting).',
    }),
    portableBody(),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Rich text') },
});

// Renders as a vertical stack: heading → full-width image → body text. The
// image is never beside or behind the heading (no overlay), so every service
// page reads top-to-bottom consistently.
export const imageText = defineType({
  name: 'imageText',
  title: 'Image + Text',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    imageField(),
    imageUrlField(),
    portableBody(),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Image + text') },
});

export const infographic = defineType({
  name: 'infographic',
  title: 'Infographic (full-width image)',
  type: 'object',
  fields: [
    imageField('image', 'Infographic image'),
    imageUrlField(),
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({ name: 'caption', title: 'Caption (optional)', type: 'string' }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Infographic') },
});

export const iconFeatures = defineType({
  name: 'iconFeatures',
  title: 'Icon Feature Columns',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'columns',
      title: 'Columns',
      type: 'number',
      options: { list: [2, 3, 4] },
      initialValue: 3,
    }),
    defineField({
      name: 'features',
      title: 'Features',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { ...imageField('icon', 'Icon') },
            imageUrlField(),
            { name: 'heading', type: 'string', title: 'Heading' },
            { name: 'text', type: 'text', rows: 3, title: 'Text' },
          ],
          preview: { select: { title: 'heading', media: 'icon' } },
        },
      ],
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Icon features') },
});

export const statBanner = defineType({
  name: 'statBanner',
  title: 'Stat Banner',
  type: 'object',
  fields: [
    defineField({
      name: 'background',
      title: 'Background',
      type: 'string',
      options: {
        list: [
          { title: 'Brand red', value: 'red' },
          { title: 'Brand ink (dark)', value: 'ink' },
          { title: 'Brand green', value: 'green' },
          { title: 'Soft gray', value: 'soft' },
        ],
        layout: 'radio',
      },
      initialValue: 'red',
    }),
    defineField({ name: 'statText', title: 'Large stat text', type: 'text', rows: 2 }),
    defineField({ name: 'subtext', title: 'Subtext', type: 'text', rows: 2 }),
    hiddenField,
  ],
  preview: { select: { statText: 'statText', hidden: 'hidden' }, ...previewWithHidden('Stat banner') },
});

export const cardGrid = defineType({
  name: 'cardGrid',
  title: 'Card Grid',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'columns',
      title: 'Columns',
      type: 'number',
      options: { list: [2, 3, 4] },
      initialValue: 3,
    }),
    defineField({
      name: 'cards',
      title: 'Cards',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'title', type: 'string', title: 'Title' },
            { name: 'text', type: 'text', rows: 3, title: 'Text' },
            { ...imageField('image', 'Image') },
            imageUrlField(),
            { name: 'ctaLabel', type: 'string', title: 'CTA label' },
            { name: 'ctaHref', type: 'string', title: 'CTA link' },
          ],
          preview: { select: { title: 'title', media: 'image' } },
        },
      ],
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Card grid') },
});

export const ctaBlock = defineType({
  name: 'ctaBlock',
  title: 'CTA Block',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'subheading', title: 'Subheading', type: 'text', rows: 2 }),
    defineField({
      name: 'buttons',
      title: 'Buttons',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', type: 'string', title: 'Label' },
            { name: 'href', type: 'string', title: 'Link' },
            {
              name: 'formSlug',
              type: 'string',
              title: 'Open a form instead (form slug)',
              description:
                'Optional (P2-FB-001). Enter a Form document’s slug (see Forms in Studio, e.g. "kitting-quote") to open that form in a popup instead of following the link. The link stays as the fallback if the form is unpublished.',
            },
          ],
          preview: { select: { title: 'label', subtitle: 'href' } },
        },
      ],
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('CTA block') },
});

export const eventList = defineType({
  name: 'eventList',
  title: 'Event List',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'events',
      title: 'Events',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'city', type: 'string', title: 'City' },
            { name: 'venue', type: 'string', title: 'Venue' },
            { name: 'date', type: 'string', title: 'Date' },
            { name: 'time', type: 'string', title: 'Time' },
          ],
          preview: {
            select: { title: 'city', venue: 'venue', date: 'date' },
            prepare: ({ title, venue, date }: { title?: string; venue?: string; date?: string }) => ({
              title: title || '(city)',
              subtitle: [venue, date].filter(Boolean).join(' · '),
            }),
          },
        },
      ],
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('Event list') },
});

export const videoEmbed = defineType({
  name: 'videoEmbed',
  title: 'Video Embed',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'url',
      title: 'Video URL',
      type: 'url',
      description:
        'Paste a YouTube, YouTube Shorts, Vimeo, Instagram, or Facebook link. The correct player is detected automatically — no need to pick a provider.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'caption', title: 'Caption (optional)', type: 'string' }),
    hiddenField,
  ],
  preview: {
    select: { heading: 'heading', url: 'url', hidden: 'hidden' },
    prepare({ heading, url, hidden }: { heading?: string; url?: string; hidden?: boolean }) {
      return {
        title: `Video: ${heading || url || '(no URL)'}`,
        subtitle: `Section${hidden ? ' · hidden' : ''}`,
      };
    },
  },
});

/**
 * Live product strip (P2-AI-004). SKU-backed entries pull the live product
 * (price, image, affiliate URL) from the Geiger catalog at render time —
 * reusing the blog/video `blogProduct` entry — so nothing goes stale in the
 * doc. Available to editors on any page from the insert menu, AND what the
 * "Generate Page with AI" action pre-fills. Also the strip the landing pages
 * (P2-AI-005) will reuse.
 */
export const productStrip = defineType({
  name: 'productStrip',
  title: 'Product Strip',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'anchorId',
      title: 'Anchor ID (optional)',
      type: 'string',
      description:
        'If set, this section becomes an in-page jump target (e.g. "products" → linkable as #products).',
    }),
    defineField({
      name: 'products',
      title: 'Products',
      type: 'array',
      of: productStripEntryMembers,
      description: `${productStripEntryDescription} The AI pre-fills SKU entries; add or remove any.`,
    }),
    hiddenField,
  ],
  preview: {
    select: { heading: 'heading', products: 'products', hidden: 'hidden' },
    prepare({
      heading,
      products,
      hidden,
    }: {
      heading?: string;
      products?: unknown[];
      hidden?: boolean;
    }) {
      const count = Array.isArray(products) ? products.length : 0;
      return {
        title: `Product strip: ${heading || `${count} product${count === 1 ? '' : 's'}`}`,
        subtitle: `Section${hidden ? ' · hidden' : ''}`,
      };
    },
  },
});

export const faqAccordion = defineType({
  name: 'faqAccordion',
  title: 'FAQ Accordion',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading (optional)', type: 'string' }),
    defineField({
      name: 'items',
      title: 'Q & A',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'question', type: 'string', title: 'Question' },
            { name: 'answer', type: 'text', rows: 4, title: 'Answer' },
          ],
          preview: { select: { title: 'question' } },
        },
      ],
    }),
    hiddenField,
  ],
  preview: { select: { heading: 'heading', hidden: 'hidden' }, ...previewWithHidden('FAQ accordion') },
});

/** All section object types, registered in the schema index. */
export const pageSectionSchemas = [
  heroBanner,
  richText,
  imageText,
  infographic,
  iconFeatures,
  statBanner,
  cardGrid,
  ctaBlock,
  eventList,
  videoEmbed,
  faqAccordion,
  productStrip,
];

/** The `of` list for a `page.sections[]` array. */
export const pageSectionRefs = pageSectionSchemas.map((s) => ({ type: s.name }));

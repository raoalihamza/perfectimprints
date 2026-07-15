import { defineField, defineType } from 'sanity';
import { ProductSkuPicker } from '../../components/ProductPicker';
import { portableBody } from '../objects/page-sections';

/**
 * Geiger themed-catalog lead page (P2-CAT-001 — Milestone 3, prompt 2 of 4).
 *
 * ONE document drives TWO routes:
 *
 *   1. `/shop-by-theme/<slug>` — the PUBLIC landing page. Long-form SEO copy
 *      (hero + portable-text body with inline images) and "Get the Catalog"
 *      CTAs at the top, middle, and end. Indexed, in the sitemap. The CTAs
 *      will open the catalog lead form (prompt 3); until then they link to
 *      /contact as a placeholder.
 *
 *   2. `/shop-by-theme/<slug>/catalog` — the GATED catalog page, reached only
 *      via the link emailed after the form is submitted (prompt 3). noindex +
 *      excluded from the sitemap + never in the menu (hidden from Google —
 *      NOT auth; anyone with the URL can open it). It has a BROWSE CATALOG
 *      button (the digital catalog viewer), the catalog's products with a
 *      /deals-style filter sidebar, and Related Blogs + Related Videos strips.
 *
 * The product set = the synced scrape from data/geiger/catalogs.json (keyed by
 * `catalogKey`, Phase I / P2-CAT-000) + `addedSkus`/`addedProducts` −
 * `hiddenSkus`, merged through the same aggregator layer /deals uses. The two
 * manual-only catalogs (Retail Collective, Trend Talk) have an EMPTY synced
 * set — Patrick's adds are their whole grid.
 */

// The catalog keys shipping in data/geiger/catalogs.json today (the Phase I
// scraper's STABLE slugs). Listed in the catalogKey field's description as a
// hint — deliberately NOT a strict dropdown, so a future catalog added to the
// scraper needs no schema change. (`shop-by-theme` itself is reserved in
// lib/reserved-slugs.ts + the page/landingPage schema mirrors so no other doc
// type can collide with this route.)
const CURRENT_CATALOG_KEYS = [
  'ideas',
  'green-guide',
  'womens-collection',
  'holiday-guide',
  'usa-made',
  'retail-collective',
  'trend-talk',
];

export default defineType({
  name: 'catalogPage',
  title: 'Catalog Page',
  type: 'document',
  fieldsets: [
    { name: 'basics', title: 'Basics', options: { collapsible: true, collapsed: false } },
    {
      name: 'landing',
      title: 'Landing page content (public, indexed)',
      description:
        'The SEO landing page at /shop-by-theme/<slug>: hero, long-form body (add photos from the catalog inline), and the "Get the Catalog" CTA that repeats at the top, middle, and end.',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'gatedProducts',
      title: 'Gated page: products (add / hide)',
      description:
        "The gated /shop-by-theme/<slug>/catalog page shows this catalog's scraped products automatically. Add extra Geiger SKUs or your own products, or hide scraped SKUs — same add/hide model as category pages. For Retail Collective and Trend Talk (no scraped set), what you add here is the whole grid.",
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'gatedStrips',
      title: 'Gated page: related blogs & videos',
      description:
        'Strips at the bottom of the gated catalog page. Pick posts/videos manually; empty slots top up automatically from the keywords.',
      options: { collapsible: true, collapsed: true },
    },
    // AI generation inputs (P2-CAT-004). Studio-only: consumed ONLY by the
    // "Generate Catalog Page with AI" action + /api/sanity/generate-catalog —
    // never read by any render path or the revalidate webhook.
    {
      name: 'ai',
      title: 'AI generation (drafting helper — not shown on the live page)',
      description:
        'Enter the Title (and Catalog key, so the copy is grounded in that catalog\'s real products), optionally keywords and a brief here, then click "Generate Catalog Page with AI" (near Publish). The AI drafts the hero, the long-form landing body with internal links, and the SEO meta for you to review and edit. It never touches your catalog key, products, or links, and nothing publishes automatically.',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      fieldset: 'basics',
      description: 'The catalog name, e.g. "USA Made". Used as the H1 fallback and page titles.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      fieldset: 'basics',
      description:
        'The URL segment: "usa-made" → /shop-by-theme/usa-made (landing) and /shop-by-theme/usa-made/catalog (gated).',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.required().custom((slug?: { current?: string }) => {
          const current = slug?.current?.trim();
          if (!current) return 'Required.';
          // Single-segment route (app/shop-by-theme/[slug]) — a slash would
          // publish fine but 404 (the app/[slug] lesson). Lowercase only.
          if (current.includes('/')) return 'No slashes — this is a single URL segment.';
          if (current !== current.toLowerCase()) return 'Lowercase only.';
          return true;
        }),
    }),
    defineField({
      name: 'catalogKey',
      title: 'Catalog key (which scraped catalog this is)',
      type: 'string',
      fieldset: 'basics',
      description: `Which entry in the yearly catalog scrape (data/geiger/catalogs.json) supplies the synced products, filters, and the default Browse Catalog link. Current keys: ${CURRENT_CATALOG_KEYS.join(
        ', ',
      )}. Retail Collective and Trend Talk have no scraped products — their key still resolves the Browse link.`,
      validation: (Rule) =>
        Rule.required().custom((value?: string) => {
          const v = value?.trim();
          if (!v) return 'Required.';
          if (!/^[a-z0-9-]+$/.test(v)) return 'Lowercase letters, numbers, and dashes only.';
          return true;
        }),
    }),
    defineField({
      name: 'browseCatalogUrl',
      title: 'Browse Catalog URL (override)',
      type: 'url',
      fieldset: 'basics',
      description:
        'Optional. The BROWSE CATALOG button on the gated page uses the scraped viewer link for this catalog key automatically — set this only to point it somewhere else.',
      validation: (Rule) => Rule.uri({ scheme: ['http', 'https'] }),
    }),

    // -----------------------------------------------------------------------
    // Landing page content (public)
    // -----------------------------------------------------------------------
    defineField({
      name: 'heroHeading',
      title: 'Hero heading (H1)',
      type: 'string',
      fieldset: 'landing',
      description: 'Blank uses the Title.',
    }),
    defineField({
      name: 'heroSubheading',
      title: 'Hero subheading',
      type: 'text',
      rows: 2,
      fieldset: 'landing',
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero image',
      type: 'image',
      fieldset: 'landing',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alt text',
          type: 'string',
          description: 'Describe the image for accessibility and SEO.',
        }),
      ],
    }),
    {
      ...portableBody('body', 'Landing page body (long-form SEO content + photos)'),
      fieldset: 'landing',
    },
    defineField({
      name: 'ctaHeading',
      title: 'CTA heading',
      type: 'string',
      fieldset: 'landing',
      description:
        'The line above each "Get the Catalog" button (top / middle / end of the landing page). Blank uses "Want the full catalog?".',
    }),
    defineField({
      name: 'ctaButtonLabel',
      title: 'CTA button label',
      type: 'string',
      fieldset: 'landing',
      description: 'Blank uses "Get the Catalog".',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      fieldset: 'landing',
    }),

    // -----------------------------------------------------------------------
    // Gated page: products (add / hide — layered on the synced scrape)
    // -----------------------------------------------------------------------
    defineField({
      name: 'addedSkus',
      title: 'Added SKUs',
      type: 'array',
      of: [{ type: 'string' }],
      fieldset: 'gatedProducts',
      components: { input: ProductSkuPicker },
      description:
        'Existing Geiger SKUs to add to this catalog\'s gated grid even if the scrape did not include them. Search by product name / SKU / brand and click to add. Resolved against the full catalog; unknown SKUs are skipped.',
    }),
    defineField({
      name: 'addedProducts',
      title: 'Added Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'customProduct' }, { type: 'productPage' }] }],
      fieldset: 'gatedProducts',
      description:
        'Your own products to add: a Custom Product (link-out card) or a Product Page (the card links to its /products/… detail page on this site). Both join the filter sidebar with their own Brand/Color/Material tags.',
    }),
    defineField({
      name: 'hiddenSkus',
      title: 'Hidden SKUs',
      type: 'array',
      of: [{ type: 'string' }],
      fieldset: 'gatedProducts',
      components: { input: ProductSkuPicker },
      description:
        'Scraped (or added) Geiger SKUs to remove from the gated grid. Same blocklist mechanism as /deals.',
    }),

    // -----------------------------------------------------------------------
    // Gated page: related strips
    // -----------------------------------------------------------------------
    defineField({
      name: 'relatedKeywords',
      title: 'Related keywords (auto-match)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'gatedStrips',
      description:
        'Plural keywords (e.g. "eco friendly tote bags") used to auto-fill the Related Blogs / Related Videos strips when you haven\'t picked enough manually. Blank falls back to the Title.',
    }),
    defineField({
      name: 'relatedBlogs',
      title: 'Related Blogs',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'blogPost' }] }],
      fieldset: 'gatedStrips',
      description: 'Shown first, in this order, at the bottom of the gated catalog page.',
    }),
    defineField({
      name: 'relatedVideos',
      title: 'Related Videos',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'video' }] }],
      fieldset: 'gatedStrips',
      description: 'Shown first, in this order, at the bottom of the gated catalog page.',
    }),

    // -----------------------------------------------------------------------
    // AI generation (Studio-only drafting helpers — no render path reads these)
    // -----------------------------------------------------------------------
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'ai',
      description:
        'A few plural keywords (e.g. "made in usa promotional products") that steer the AI copy and the internal links.',
    }),
    defineField({
      name: 'aiBrief',
      title: 'Brief (optional)',
      type: 'text',
      rows: 3,
      fieldset: 'ai',
      description:
        'A sentence or two steering the AI, e.g. "Angle it at year-end corporate gifting; mention employee appreciation programs."',
    }),
    defineField({
      name: 'aiSuggestedLinks',
      title: 'Suggested Internal Links',
      type: 'array',
      fieldset: 'ai',
      description:
        'Internal links the AI found and whether each was placed in the body. Not shown on the live page. Filled only when empty.',
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
    select: { title: 'title', slug: 'slug.current', catalogKey: 'catalogKey' },
    prepare({ title, slug, catalogKey }: { title?: string; slug?: string; catalogKey?: string }) {
      return {
        title: title || '(untitled catalog page)',
        subtitle: [slug ? `/shop-by-theme/${slug}` : 'no slug', catalogKey ? `key: ${catalogKey}` : null]
          .filter(Boolean)
          .join(' — '),
      };
    },
  },
});

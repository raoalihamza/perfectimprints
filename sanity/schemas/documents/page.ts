import { defineField, defineType } from 'sanity';
import { pageSectionRefs } from '../objects/page-sections';

/**
 * Reserved top-level slugs a `page` must not use — each is owned by another
 * route (a top-level/folder route, /api, the obfuscated Studio, or one of the
 * eight fixed footer/legal pages). A `page` renders at `/<slug>` via the ROOT
 * CATCH-ALL app/[...slug]/page.tsx, so a slug MAY contain slashes and renders at
 * its full multi-segment path (e.g. "industry/hvac" → /industry/hvac). Only
 * single-segment reserved slugs are blocked here (dedicated folder routes like
 * /cat and /services always beat the catch-all, so a nested path can't shadow
 * them). Mirrored from lib/reserved-slugs.ts (the standalone Studio bundler
 * can't import from lib/) — keep the two lists in sync. NOTE: the Services page
 * slugs (kitting, company-stores, …) are deliberately absent so those existing
 * docs stay valid; the route/sitemap exclude them separately.
 */
const RESERVED_SLUGS = [
  'cat',
  'blog',
  'videos',
  'brands',
  'deals',
  'new-products',
  'rush-products',
  'rush-promotional-products',
  'promotional-products',
  'products',
  'shop-by-theme',
  'quote',
  'portfolio',
  'faq',
  'search',
  'services',
  'admin3773752',
  'api',
  'about',
  'contact',
  'terms',
  'privacy-security',
  'returns',
  'shipping-policy',
  'sample-policy',
  'company-core-values',
];

/**
 * Generic, section-based content page (M5-506b).
 *
 * One document type powers every editable marketing/legal page — Services
 * (Kitting, Company Stores, Popup Stores, Custom Products) now, and About /
 * Privacy / Terms / Contact later. The page is an ordered `sections[]` array of
 * polymorphic section objects, giving Patrick website-builder behavior in
 * Studio: reorder, insert any section type, delete, and hide-without-deleting.
 *
 * `slug` is the route segment the page renders at (e.g. "kitting" →
 * /services/kitting). Routes query by slug.
 */
export default defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fieldsets: [
    // AI generation inputs (P2-AI-004). Studio-only: consumed ONLY by the
    // "Generate Page with AI" action + /api/sanity/generate-page — never read
    // by any render path or the revalidate webhook.
    {
      name: 'ai',
      title: 'AI generation (drafting helper — not shown on the live page)',
      description:
        'Enter a Title above (plus optionally a brief and keywords here), click "Generate Page with AI" (near Publish), then review the draft sections it appends: hero text, body copy with internal links, a product strip, a stat banner, FAQs, and a closing CTA. Add images and set CTA button links yourself. Nothing here renders on the live site.',
      options: { collapsible: true, collapsed: false },
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description:
        'Route path this page renders at. A non-reserved slug renders at /<slug> (e.g. "llm-info-perfect-imprints" → /llm-info-perfect-imprints). Slashes are allowed for multi-segment URLs (e.g. "industry/hvac" → /industry/hvac). Services page slugs render at /services/<slug>.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.required().custom((slug?: { current?: string }) => {
          const current = slug?.current;
          if (current && RESERVED_SLUGS.includes(current)) {
            return 'This URL is reserved by the site; choose another slug.';
          }
          return true;
        }),
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: pageSectionRefs,
      description:
        'Ordered page sections. Drag to reorder, insert any section type, delete, or toggle a section hidden.',
    }),

    // -----------------------------------------------------------------------
    // AI generation inputs/outputs (P2-AI-004) — see the fieldset note above.
    // -----------------------------------------------------------------------
    defineField({
      name: 'aiBrief',
      title: 'Page brief (optional)',
      type: 'text',
      rows: 3,
      fieldset: 'ai',
      description:
        'A sentence or two on what this page is about, to steer the AI. The page Title is the main input.',
    }),
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'ai',
      description:
        'Optional. A few plural keywords (e.g. "custom water bottles") that steer the product strip and the internal links.',
    }),
    defineField({
      name: 'aiSuggestedLinks',
      title: 'Suggested Internal Links',
      type: 'array',
      fieldset: 'ai',
      description:
        'Internal links the AI found and whether each was placed in the body. Not shown on the live page.',
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
    select: { title: 'title', slug: 'slug.current' },
    prepare: ({ title, slug }: { title?: string; slug?: string }) => ({
      title: title || '(untitled page)',
      subtitle: slug ? `/${slug}` : 'no slug',
    }),
  },
});

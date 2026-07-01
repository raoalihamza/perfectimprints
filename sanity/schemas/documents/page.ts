import { defineField, defineType } from 'sanity';
import { pageSectionRefs } from '../objects/page-sections';

/**
 * Reserved top-level slugs a `page` must not use — each is owned by another
 * route (a top-level/folder route, /api, the obfuscated Studio, or one of the
 * eight fixed footer/legal pages). A `page` renders at `/<slug>` via
 * app/[slug]/page.tsx, so publishing at a reserved slug would collide with an
 * existing route. Mirrored from lib/reserved-slugs.ts (the standalone Studio
 * bundler can't import from lib/) — keep the two lists in sync. NOTE: the
 * Services page slugs (kitting, company-stores, …) are deliberately absent so
 * those existing docs stay valid; the route/sitemap exclude them separately.
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
        'Route segment this page renders at. A non-reserved slug renders at /<slug> (e.g. "llm-info-perfect-imprints" → /llm-info-perfect-imprints); Services page slugs render at /services/<slug>.',
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
  ],
  preview: {
    select: { title: 'title', slug: 'slug.current' },
    prepare: ({ title, slug }: { title?: string; slug?: string }) => ({
      title: title || '(untitled page)',
      subtitle: slug ? `/${slug}` : 'no slug',
    }),
  },
});

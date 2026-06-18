import { defineField, defineType } from 'sanity';
import { pageSectionRefs } from '../objects/page-sections';

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
      description: 'Route segment this page renders at (e.g. "kitting" for /services/kitting).',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
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

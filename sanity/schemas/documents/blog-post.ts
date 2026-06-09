import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'blogPost',
  title: 'Blog Post',
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
      // No `source` — slugs are imported verbatim from the original PI URLs so
      // /blog/[slug] resolves to the same path as before. New posts created in
      // Studio can paste a slug manually or click Generate.
      options: { maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'headerImage',
      title: 'Header Image',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'body',
      title: 'Body',
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
                  { name: 'href', type: 'string', title: 'URL' },
                  {
                    name: 'openInNewTab',
                    type: 'boolean',
                    title: 'Open in new tab',
                    initialValue: false,
                  },
                ],
              },
            ],
          },
        },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
        },
        {
          type: 'object',
          name: 'embed',
          title: 'Video Embed',
          fields: [
            {
              name: 'provider',
              title: 'Provider',
              type: 'string',
              options: {
                list: [
                  { title: 'YouTube', value: 'youtube' },
                  { title: 'Vimeo', value: 'vimeo' },
                  { title: 'Other iframe', value: 'iframe' },
                ],
              },
            },
            { name: 'url', title: 'Embed URL', type: 'url' },
            {
              name: 'videoId',
              title: 'Video ID',
              type: 'string',
              description: 'YouTube/Vimeo video ID (auto-populated during import)',
            },
            { name: 'caption', title: 'Caption', type: 'string' },
          ],
          preview: {
            select: { provider: 'provider', url: 'url' },
            prepare({ provider, url }) {
              return { title: `${provider || 'iframe'} embed`, subtitle: url };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{ type: 'author' }],
    }),
    defineField({
      name: 'publishDate',
      title: 'Publish Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'updatedDate',
      title: 'Updated Date',
      type: 'datetime',
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'blogCategory' }] }],
    }),
    defineField({
      name: 'relatedCategorySlugs',
      title: 'Related Category Slugs',
      description:
        'PI root category slugs this blog should surface under in the "Related Blogs About …" section on category pages. Best-effort populated during migration; edit freely.',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'relatedPosts',
      title: 'Related Posts',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'blogPost' }] }],
    }),
    defineField({
      name: 'metaTitle',
      title: 'Meta Title',
      type: 'string',
      validation: (Rule) => Rule.max(60),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description',
      type: 'text',
      rows: 2,
      validation: (Rule) => Rule.max(155),
    }),
    defineField({
      name: 'seo',
      title: 'SEO (extra)',
      description: 'Optional advanced SEO overrides. Title/description above are used by default.',
      type: 'seo',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'slug.current', media: 'headerImage' },
  },
  orderings: [
    {
      title: 'Publish date, newest first',
      name: 'publishDateDesc',
      by: [{ field: 'publishDate', direction: 'desc' }],
    },
    {
      title: 'Title A→Z',
      name: 'titleAsc',
      by: [{ field: 'title', direction: 'asc' }],
    },
  ],
});

import { defineField, defineType } from 'sanity';
import { CategorySlugInput } from '../../components/CategoryPicker';
import { inlineImageAlignField, inlineImageSizeField } from '../objects/inline-image-fields';

export default defineType({
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
  fieldsets: [
    {
      name: 'ai',
      title: 'AI generation (drafting helper — not shown on the live page)',
      description:
        'Inputs for the "Generate Blog with AI" button (near Publish). Fill these, click the button, then review and edit the draft it writes. Nothing here renders on the live site.',
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
          // size/align are optional (NO initialValue): unset = full width, the
          // pre-existing behavior, so nothing already published shifts.
          fields: [
            { name: 'alt', type: 'string', title: 'Alt text' },
            inlineImageSizeField,
            inlineImageAlignField,
          ],
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
        { type: 'blogProducts' },
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
      name: 'relatedBlogs',
      title: 'Related Blogs (manual override)',
      description:
        'When set, these override the automatic related-blogs list for this post, in this order. Leave empty to use automatic matching by shared categories.',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'blogPost' }],
          options: {
            filter: ({ document }) =>
              document?._id
                ? {
                    filter: '_id != $self && _id != $draft',
                    params: {
                      self: document._id.replace(/^drafts\./, ''),
                      draft: `drafts.${document._id.replace(/^drafts\./, '')}`,
                    },
                  }
                : {},
          },
        },
      ],
    }),
    defineField({
      name: 'ctaTopic',
      title: 'CTA Heading (optional)',
      type: 'string',
      description:
        "The exact heading shown on the 'Order Custom … Today' call-to-action block on this post. Whatever you type appears exactly as-is. Leave blank to use the automatic 'Order Custom [category] Today'. This does not affect the Related Blogs heading.",
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

    // -----------------------------------------------------------------------
    // AI generation inputs/outputs (P2-AI-002). Studio-only: consumed ONLY by
    // the "Generate Blog with AI" action + /api/sanity/generate-blog — never
    // read by any render path or the revalidate webhook, so they add no cache
    // tag or webhook-projection burden.
    // -----------------------------------------------------------------------
    defineField({
      name: 'aiTemplate',
      title: 'Template',
      type: 'string',
      fieldset: 'ai',
      initialValue: 'list',
      options: {
        list: [
          {
            title: 'List-style: "10 Ideas …" with a product strip under each idea',
            value: 'list',
          },
          { title: 'Single-category focus with one product strip', value: 'single' },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'ai',
      description:
        'A few plural keywords that steer the writing, the product strips, and the internal-link suggestions (e.g. "custom water bottles", "trade show giveaways").',
    }),
    defineField({
      name: 'aiPrimaryCategorySlug',
      title: 'Primary Category (for related products)',
      type: 'string',
      fieldset: 'ai',
      components: { input: CategorySlugInput },
      description:
        'Optional. For a single-category post this is where products are pulled from first; for a list post each idea matches its own product type and this is only a fallback. Leave blank to match by keywords only.',
    }),
    defineField({
      name: 'aiWordCount',
      title: 'Approximate word count',
      type: 'number',
      fieldset: 'ai',
      initialValue: 1500,
      validation: (Rule) => Rule.min(1300).max(1900),
      description:
        'Roughly how long the post should be (default 1500, roughly 1300 to 1900). The AI targets this but will not hit it exactly; expect within about 15 percent.',
    }),
    defineField({
      name: 'aiSuggestedLinks',
      title: 'Suggested Internal Links',
      type: 'array',
      fieldset: 'ai',
      description:
        'Internal links the AI found for this topic. Add the ones you like into the body text yourself (select text → link). Not shown on the live page.',
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

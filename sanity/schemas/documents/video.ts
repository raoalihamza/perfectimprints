import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'video',
  title: 'Video',
  type: 'document',
  fieldsets: [
    // AI generation inputs (P2-AI-003). Studio-only: consumed ONLY by the
    // "Generate Video Details with AI" action + /api/sanity/generate-video —
    // never read by any render path or the revalidate webhook.
    {
      name: 'ai',
      title: 'AI generation (drafting helper — not shown on the live page)',
      description:
        'Paste the video script below, click "Generate Video Details with AI" (near Publish), then review the draft it writes: title, meta, long-form description with internal links, and a related-products strip. Nothing here renders on the live site.',
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
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    // One field for every platform — the player detects the provider from the
    // URL (see lib/video/embed.ts). YouTube/Shorts and Vimeo embed cleanly;
    // Instagram and Facebook are best-effort (their embeds can fail on privacy
    // settings), so set a custom Thumbnail and test those links individually.
    defineField({
      name: 'embedUrl',
      title: 'Video Link',
      type: 'url',
      description:
        'Paste a YouTube video or Shorts, Vimeo, Instagram, or Facebook link. ' +
        'The player auto-detects the platform. For Instagram/Facebook, also set a custom thumbnail and test the link.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'thumbnail',
      title: 'Custom Thumbnail',
      type: 'image',
      options: { hotspot: true },
      description:
        'Optional. Used on the video card and as the share/thumbnail image. ' +
        'If omitted, YouTube links auto-derive a thumbnail; other platforms fall back to a placeholder.',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      // Rich text (Task B) so descriptions can contain links. The meta/OG/Twitter
      // description and VideoObject JSON-LD use a plain-text extraction.
      type: 'richAnswer',
    }),
    // Rendered on the live page (P2-AI-003): a product strip under the
    // description on /videos/<slug>. Reuses the blog body's `blogProduct` entry
    // type so SKU resolution + ProductCard rendering are identical to blogs.
    defineField({
      name: 'relatedProducts',
      title: 'Related Products',
      type: 'array',
      of: [{ type: 'blogProduct' }],
      description:
        'Shown as a product strip under the description on the video page. The AI pre-fills these; add or remove any (add by Geiger SKU, or fill the manual fields for a non-Geiger product).',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'blogCategory' }],
    }),
    defineField({
      name: 'publishDate',
      title: 'Publish Date',
      type: 'datetime',
    }),
    // Optional explicit SEO overrides. When empty, the /videos/<slug> page falls
    // back to: Title → meta title, Description → meta description, Custom
    // Thumbnail (or auto YouTube thumbnail) → social image.
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),

    // -----------------------------------------------------------------------
    // AI generation inputs/outputs (P2-AI-003) — see the fieldset note above.
    // -----------------------------------------------------------------------
    defineField({
      name: 'aiScript',
      title: 'Video Script / Transcript',
      type: 'text',
      rows: 12,
      fieldset: 'ai',
      description:
        "Paste the video's script or transcript. The AI writes the title, description, and meta from this.",
    }),
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'ai',
      description:
        'Optional. A few plural keywords (e.g. "custom water bottles") that steer the related products and the internal links.',
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
    select: { title: 'title', subtitle: 'embedUrl', media: 'thumbnail' },
  },
});

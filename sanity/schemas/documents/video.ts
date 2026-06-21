import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'video',
  title: 'Video',
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
      type: 'text',
      rows: 4,
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
  ],
  preview: {
    select: { title: 'title', subtitle: 'embedUrl', media: 'thumbnail' },
  },
});

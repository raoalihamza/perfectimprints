import { defineField, defineType } from 'sanity';

/**
 * Portfolio Gallery category (PORT-100).
 *
 * Patrick was told he can rename, add to and remove the portfolio categories
 * himself, which is why this is its own document type rather than a fixed
 * `options.list` on the item. A category's `slug` is what appears in a
 * filtered gallery URL (PORT-110), `displayOrder` is the order of the filter
 * buttons, and `hidden` takes a category out of the filters without deleting
 * it (the items keep their reference, so nothing breaks).
 *
 * Seeded by nobody: Patrick creates the seven he agreed (T-shirts, Caps and
 * Hats, Drinkware, Bags, Outerwear, Signs and Banners, Other) in Studio.
 */
export default defineType({
  name: 'portfolioCategory',
  title: 'Portfolio Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'The filter button label on the gallery, e.g. "Caps and Hats".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description:
        'Appears in the gallery\'s filtered link, e.g. /portfolio?category=caps-and-hats. Click Generate.',
      options: { source: 'title', maxLength: 64 },
      validation: (Rule) =>
        Rule.required().custom((slug?: { current?: string }) => {
          const current = slug?.current?.trim();
          if (!current) return 'Required. Click Generate next to the field.';
          if (current.includes('/')) return 'No slashes. This is a single word or dashed phrase.';
          if (current !== current.toLowerCase()) return 'Lowercase only.';
          // The slug travels in the gallery's filtered link as a comma-joined
          // value (PORT-110: ?category=caps-and-hats,t-shirts), so it must be
          // lowercase letters, digits and single dashes and nothing else. A
          // comma, space or plus sign inside it would be read back as two
          // values and the shared link would open unfiltered.
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(current)) {
            return 'Letters, numbers and single dashes only, e.g. caps-and-hats. Click Generate to make one from the title.';
          }
          return true;
        }),
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display order',
      type: 'number',
      description:
        'Controls the order of the filter buttons: lower numbers come first. Leave blank to sort after the numbered ones, alphabetically.',
      validation: (Rule) => Rule.integer(),
    }),
    defineField({
      name: 'hidden',
      title: 'Hidden',
      type: 'boolean',
      description:
        'Take this category out of the gallery filters without deleting it. Items in it stay attached and can be shown again by turning this off.',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Display order',
      name: 'displayOrderAsc',
      by: [
        { field: 'displayOrder', direction: 'asc' },
        { field: 'title', direction: 'asc' },
      ],
    },
  ],
  preview: {
    select: { title: 'title', slug: 'slug.current', hidden: 'hidden', order: 'displayOrder' },
    prepare({ title, slug, hidden, order }) {
      const parts: string[] = [];
      if (typeof order === 'number') parts.push(`#${order}`);
      if (slug) parts.push(slug);
      if (hidden) parts.push('HIDDEN');
      return { title: title || 'Untitled category', subtitle: parts.join(' · ') };
    },
  },
});

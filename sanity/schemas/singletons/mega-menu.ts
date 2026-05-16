import { defineField, defineType } from 'sanity';

const menuItem = {
  type: 'object',
  name: 'menuItem',
  fields: [
    { name: 'label', type: 'string', title: 'Label' },
    { name: 'href', type: 'string', title: 'Link' },
    {
      name: 'featured',
      type: 'boolean',
      title: 'Featured Section',
      description:
        'When true, this dropdown is populated from product references (Featured Promos / New Products).',
      initialValue: false,
    },
    {
      name: 'children',
      type: 'array',
      title: 'Children',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', type: 'string', title: 'Label' },
            { name: 'href', type: 'string', title: 'Link' },
          ],
          preview: { select: { title: 'label', subtitle: 'href' } },
        },
      ],
    },
    {
      name: 'productRefs',
      type: 'array',
      title: 'Product References (Featured/New only)',
      of: [{ type: 'reference', to: [{ type: 'customProduct' }] }],
    },
  ],
  preview: { select: { title: 'label', subtitle: 'href' } },
};

export default defineType({
  name: 'megaMenu',
  title: 'Mega Menu',
  type: 'document',
  fields: [
    defineField({
      name: 'items',
      title: 'Menu Items',
      type: 'array',
      of: [menuItem],
      initialValue: [
        {
          _type: 'menuItem',
          label: 'Promotional Products',
          href: '/cat/promotional-products',
          featured: false,
          children: [
            { label: 'Bags & Totes', href: '/cat/bags-and-totes' },
            { label: 'Drinkware', href: '/cat/drinkware' },
            { label: 'Health & Wellness', href: '/cat/health-and-wellness' },
            { label: 'Home & Auto', href: '/cat/home-and-auto' },
            { label: 'Office & Technology', href: '/cat/office-and-technology' },
            { label: 'Sports & Outdoor', href: '/cat/sports-and-outdoor' },
            { label: 'Trade Show & Event', href: '/cat/trade-show-and-event' },
            { label: 'Writing Instruments', href: '/cat/writing-instruments' },
          ],
        },
        {
          _type: 'menuItem',
          label: 'Custom Apparel',
          href: '/cat/custom-apparel',
          featured: false,
          children: [
            { label: 'Athleisure', href: '/cat/athleisure' },
            { label: 'Caps & Hats', href: '/cat/caps-and-hats' },
            { label: 'Dress Shirts', href: '/cat/dress-shirts' },
            { label: 'T-Shirts', href: '/cat/t-shirts' },
            { label: 'Tank Tops', href: '/cat/tank-tops' },
            { label: 'Workwear', href: '/cat/workwear' },
            { label: 'Quarter Zips', href: '/cat/quarter-zips' },
            { label: 'Hoodies', href: '/cat/hoodies' },
            { label: 'Polos & Golf Shirts', href: '/cat/polos-and-golf-shirts' },
            { label: 'Jackets', href: '/cat/jackets' },
          ],
        },
        {
          _type: 'menuItem',
          label: 'Featured Promos',
          href: '#',
          featured: true,
          children: [],
        },
        {
          _type: 'menuItem',
          label: 'New Products',
          href: '#',
          featured: true,
          children: [],
        },
        {
          _type: 'menuItem',
          label: 'Rush Products',
          href: '/rush-promotional-products',
          featured: false,
          children: [],
        },
        {
          _type: 'menuItem',
          label: 'Services',
          href: '#',
          featured: false,
          children: [
            { label: 'Kitting', href: '/services/kitting' },
            { label: 'Company Stores', href: '/services/company-stores' },
            { label: 'Popup Stores', href: '/services/popup-stores' },
            { label: '100% Custom Products', href: '/services/custom-products' },
          ],
        },
        {
          _type: 'menuItem',
          label: 'Videos',
          href: '/videos',
          featured: false,
          children: [],
        },
        {
          _type: 'menuItem',
          label: 'Blog',
          href: '/blog',
          featured: false,
          children: [],
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Mega Menu' }),
  },
});

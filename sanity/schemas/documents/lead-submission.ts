import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'leadSubmission',
  title: 'Lead Submission',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'firstName', title: 'First Name', type: 'string', readOnly: true }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string', readOnly: true }),
    defineField({ name: 'email', title: 'Email', type: 'string', readOnly: true }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', readOnly: true }),
    defineField({
      name: 'company',
      title: 'Company',
      type: 'string',
      readOnly: true,
      description: 'Set on product-quote submissions (P2-CP-002).',
    }),
    defineField({
      name: 'lookingFor',
      title: 'Looking For',
      type: 'text',
      rows: 4,
      readOnly: true,
    }),
    defineField({ name: 'quantityNeeded', title: 'Quantity Needed', type: 'string', readOnly: true }),
    defineField({ name: 'dateNeeded', title: 'Date Needed', type: 'string', readOnly: true }),
    defineField({
      name: 'shippingZip',
      title: 'Shipping Zip',
      type: 'string',
      readOnly: true,
      description: 'Set on product-quote submissions (P2-CP-002).',
    }),
    defineField({
      name: 'comments',
      title: 'Comments',
      type: 'text',
      rows: 4,
      readOnly: true,
      description: 'Set on product-quote submissions (P2-CP-002).',
    }),
    defineField({
      name: 'productTitle',
      title: 'Quoted Product',
      type: 'string',
      readOnly: true,
      description:
        'Set on product-quote submissions (P2-CP-002): the Product Page title, resolved server-side.',
    }),
    defineField({
      name: 'productSlug',
      title: 'Quoted Product Slug',
      type: 'string',
      readOnly: true,
      description: 'The /products/<slug> the quote came from.',
    }),
    defineField({ name: 'sourceUrl', title: 'Source URL', type: 'string', readOnly: true }),
    defineField({
      name: 'recipient',
      title: 'Lead sent to',
      type: 'string',
      readOnly: true,
      description:
        'Set on landing-page (P2-AI-005) and product-quote (P2-CP-002) submissions: the email the lead notification actually went to (the page’s Lead recipient, or the site default).',
    }),
    defineField({ name: 'submittedAt', title: 'Submitted At', type: 'datetime', readOnly: true }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      description: 'Logo / artwork files the visitor uploaded with the lead form.',
      type: 'array',
      readOnly: true,
      of: [{ type: 'file' }],
    }),
  ],
  preview: {
    select: { firstName: 'firstName', lastName: 'lastName', email: 'email', sourceUrl: 'sourceUrl' },
    prepare({ firstName, lastName, email, sourceUrl }) {
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      return {
        title: name,
        subtitle: email,
        description: sourceUrl,
      };
    },
  },
});

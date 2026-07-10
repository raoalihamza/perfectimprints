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
    defineField({
      name: 'selectedColor',
      title: 'Selected Color',
      type: 'string',
      readOnly: true,
      description: 'Set by the product-page configurator (P2-CP configurator).',
    }),
    defineField({
      name: 'selectedSize',
      title: 'Selected Size',
      type: 'string',
      readOnly: true,
      description: 'Set by the product-page configurator.',
    }),
    defineField({
      name: 'selectedDecoration',
      title: 'Selected Decoration',
      type: 'string',
      readOnly: true,
      description: 'Set by the product-page configurator.',
    }),
    defineField({
      name: 'estimatedTotal',
      title: 'Estimated Total',
      type: 'string',
      readOnly: true,
      description:
        'The on-page ESTIMATE shown to the customer (quantity × tier price + setup charge) — never a firm price; final pricing is confirmed in the quote.',
    }),
    defineField({
      name: 'formTitle',
      title: 'Form',
      type: 'string',
      readOnly: true,
      description: 'Set on form-builder submissions (P2-FB-001): the Form document’s title.',
    }),
    defineField({
      name: 'formSlug',
      title: 'Form Slug',
      type: 'string',
      readOnly: true,
      description: 'The form-builder slug the submission came through.',
    }),
    defineField({
      name: 'answers',
      title: 'Answers',
      type: 'array',
      readOnly: true,
      description:
        'Form-builder submissions (P2-FB-001): every answered field as label + value, in the form’s field order.',
      of: [
        {
          type: 'object',
          name: 'formAnswer',
          fields: [
            defineField({ name: 'label', title: 'Question', type: 'string', readOnly: true }),
            defineField({ name: 'value', title: 'Answer', type: 'text', rows: 2, readOnly: true }),
          ],
          preview: { select: { title: 'label', subtitle: 'value' } },
        },
      ],
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

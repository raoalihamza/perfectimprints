import { defineField, defineType } from 'sanity';

/**
 * Reusable form builder (P2-FB-001). Patrick builds ANY quote/contact form —
 * choose the fields, the recipient, the confirmation behavior — and any page
 * CTA (ctaBlock button / hero CTA) can open it in a popup by its slug.
 *
 * The slug is the form's stable id: the page CTA stores it, and the submit
 * route resolves the recipient + validates required fields SERVER-SIDE from
 * it (the browser never sends a recipient address — no open relay).
 *
 * The field-type list mirrors lib/forms/form-def.ts (kept inline because the
 * standalone Studio bundler can't import lib/). Change both together.
 */

const FIELD_TYPES = [
  { title: 'Short text (single line)', value: 'shortText' },
  { title: 'Long text (paragraph)', value: 'longText' },
  { title: 'Email address', value: 'email' },
  { title: 'Phone number', value: 'phone' },
  { title: 'Number', value: 'number' },
  { title: 'Date', value: 'date' },
  { title: 'Dropdown (pick one)', value: 'dropdown' },
  { title: 'Checkbox (yes / no)', value: 'checkbox' },
  { title: 'Checkbox group (pick many)', value: 'checkboxGroup' },
  { title: 'File upload', value: 'fileUpload' },
];

const OPTION_TYPES = new Set(['dropdown', 'checkboxGroup']);

export default defineType({
  name: 'form',
  title: 'Form',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Shown as the form heading (and in the lead email subject).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description:
        'The form’s stable id — page buttons reference it, and the lead recipient is resolved from it server-side. Changing it detaches any button already pointing at the old value.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipientEmail',
      title: 'Lead recipient email',
      type: 'string',
      description: 'Where this form’s submissions are emailed.',
      initialValue: 'patrick@perfectimprints.com',
      validation: (Rule) =>
        Rule.custom((value?: string) => {
          if (!value) return true; // blank → site default recipient
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
            ? true
            : 'Enter a valid email address.';
        }),
    }),
    defineField({
      name: 'sendCustomerConfirmation',
      title: 'Email the customer a confirmation copy',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'intro',
      title: 'Intro (optional)',
      type: 'text',
      rows: 2,
      description: 'Short blurb shown above the fields.',
    }),
    defineField({
      name: 'fields',
      title: 'Fields',
      type: 'array',
      validation: (Rule) => Rule.required().min(1),
      of: [
        {
          type: 'object',
          name: 'formField',
          title: 'Field',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'fieldType',
              title: 'Field type',
              type: 'string',
              options: { list: FIELD_TYPES },
              initialValue: 'shortText',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'options',
              title: 'Options',
              type: 'array',
              of: [{ type: 'string' }],
              description: 'The choices — dropdown / checkbox group only.',
              hidden: ({ parent }) => !OPTION_TYPES.has((parent as { fieldType?: string })?.fieldType ?? ''),
              validation: (Rule) =>
                Rule.custom((options, context) => {
                  const parent = context.parent as { fieldType?: string } | undefined;
                  if (!OPTION_TYPES.has(parent?.fieldType ?? '')) return true;
                  return Array.isArray(options) && options.filter(Boolean).length > 0
                    ? true
                    : 'Add at least one option for a dropdown / checkbox group.';
                }),
            }),
            defineField({
              name: 'required',
              title: 'Required',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'placeholder',
              title: 'Placeholder (optional)',
              type: 'string',
            }),
          ],
          preview: {
            select: { label: 'label', fieldType: 'fieldType', required: 'required' },
            prepare({ label, fieldType, required }) {
              const typeTitle =
                FIELD_TYPES.find((t) => t.value === fieldType)?.title ?? fieldType ?? '?';
              return {
                title: label || '(no label)',
                subtitle: `${typeTitle}${required ? ' · required' : ''}`,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'submitButtonLabel',
      title: 'Submit button label',
      type: 'string',
      initialValue: 'Request a Quote',
    }),
    defineField({
      name: 'successMessage',
      title: 'Success message',
      type: 'text',
      rows: 2,
      initialValue: 'Thanks, we received your request and will get back to you shortly.',
      description: 'Shown in place of the form after a successful submission.',
    }),
  ],
  preview: {
    select: { title: 'title', slug: 'slug.current', fields: 'fields' },
    prepare({ title, slug, fields }) {
      const count = Array.isArray(fields) ? fields.length : 0;
      return {
        title: title || '(untitled form)',
        subtitle: `${slug ? `${slug} · ` : ''}${count} field${count === 1 ? '' : 's'}`,
      };
    },
  },
});

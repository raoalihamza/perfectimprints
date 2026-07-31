import { defineField, defineType, type SlugValue } from 'sanity';
import {
  QuoteNumberInput,
  QuoteResponsesInput,
  QuoteTotalsInput,
} from '../../components/QuoteInputs';

/**
 * A customer quotation (Q-110 - Quick Quote data foundation). Patrick builds
 * a quote (product lines + charge lines + customer block + dates), and the
 * customer will eventually open it at a private link (/quote/<token>) and
 * accept it or request a revision. This prompt ships the DOCUMENT only: the
 * customer page, the PDF, the send button, and the accept/revise flow arrive
 * in later updates.
 *
 * Identity rules:
 *   - `quoteNumber` is sequential ("Q-1001", ...), assigned by the one-click
 *     allocator (lib/quotes/numbering.ts) - never typed by hand.
 *   - `slug` holds the PRIVATE LINK TOKEN: 16 cryptographically random bytes
 *     as 32 LOWERCASE hex chars, generated once at document creation.
 *     Lowercase is mandatory, not cosmetic: the cache-tag sanitizer
 *     (lib/sanity/cache-tags.ts) lowercases tag values, so a mixed-case token
 *     would collapse two different tokens onto one cache tag. Storing the
 *     token AS the slug means the existing webhook Projection (which already
 *     carries `slug`) needs no change. Server twin: lib/quotes/token.ts.
 *
 * There is deliberately NO editable status field: Patrick's side of the story
 * is derived from `sentAt` plus the latest `quoteResponse` record (customer
 * actions are separate append-only documents - a publish of THIS document
 * replaces it wholesale, so customer state must never live on it).
 */

/**
 * Browser-side token generator (Web Crypto - this runs in the Studio). Keep
 * in agreement with lib/quotes/token.ts: 16 bytes, lowercase hex. Inline here
 * because schema files stay dependency-free for the standalone Studio bundler.
 */
function generateQuoteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export default defineType({
  name: 'quote',
  title: 'Quote',
  type: 'document',
  fieldsets: [
    { name: 'identity', title: 'Quote identity', options: { collapsible: true, collapsed: false } },
    { name: 'customer', title: 'Customer', options: { collapsible: true, collapsed: false } },
    {
      name: 'rep',
      title: 'Your details (shown on the quote)',
      options: { collapsible: true, collapsed: true },
    },
    { name: 'dates', title: 'Dates', options: { collapsible: true, collapsed: false } },
    { name: 'totals', title: 'Tax & totals', options: { collapsible: true, collapsed: false } },
    { name: 'sending', title: 'Sending & responses', options: { collapsible: true, collapsed: false } },
  ],
  fields: [
    // ---- Identity ----
    defineField({
      name: 'quoteNumber',
      title: 'Quote number',
      type: 'string',
      fieldset: 'identity',
      components: { input: QuoteNumberInput },
      description: 'Assigned automatically with the button - sequential and never reused.',
      validation: (Rule) =>
        Rule.required().custom(async (value: string | undefined, context) => {
          if (!value) return true; // required() covers the empty case
          // Uniqueness across all OTHER quotes (this doc's own draft +
          // published pair is excluded). Runs as an async dataset query, so
          // it also catches a duplicated document at publish time.
          const client = context.getClient({ apiVersion: '2024-10-01' });
          const id = context.document?._id ?? '';
          const published = id.replace(/^drafts\./, '');
          const duplicates = await client.fetch<number>(
            `count(*[_type == "quote" && quoteNumber == $value && !(_id in [$published, $draft])])`,
            { value, published, draft: `drafts.${published}` },
          );
          return duplicates === 0
            ? true
            : 'Another quote already has this number. Duplicating a quote is not supported - create a new one instead.';
        }),
    }),
    defineField({
      name: 'slug',
      title: 'Private link token',
      type: 'slug',
      fieldset: 'identity',
      readOnly: true,
      description:
        'The unguessable token in the customer\'s private link (/quote/<token>). Generated automatically - never edit or reuse it.',
      // Generated ONCE at document creation. Note: "Duplicate" copies this
      // value, which is why the uniqueness rule below exists (a duplicated
      // quote cannot be published until it is recreated properly).
      initialValue: () => ({ _type: 'slug', current: generateQuoteToken() }),
      validation: (Rule) =>
        Rule.required().custom(async (slug: SlugValue | undefined, context) => {
          const current = slug?.current;
          if (!current) return 'The private link token is missing - create a new quote instead.';
          if (!TOKEN_PATTERN.test(current)) {
            return 'The token must be 32 lowercase hex characters (assigned automatically).';
          }
          const client = context.getClient({ apiVersion: '2024-10-01' });
          const id = context.document?._id ?? '';
          const published = id.replace(/^drafts\./, '');
          const duplicates = await client.fetch<number>(
            `count(*[_type == "quote" && slug.current == $value && !(_id in [$published, $draft])])`,
            { value: current, published, draft: `drafts.${published}` },
          );
          return duplicates === 0
            ? true
            : 'Another quote already uses this private link. Duplicating a quote is not supported - create a new one instead.';
        }),
    }),
    defineField({
      name: 'title',
      title: 'Internal label',
      type: 'string',
      fieldset: 'identity',
      description:
        'A short label so you can find this quote in the list (e.g. the customer\'s company name). Never shown to the customer.',
    }),

    // ---- Customer ----
    defineField({
      name: 'customerCompany',
      title: 'Company',
      type: 'string',
      fieldset: 'customer',
    }),
    defineField({
      name: 'customerName',
      title: 'Contact name',
      type: 'string',
      fieldset: 'customer',
    }),
    defineField({
      name: 'customerEmail',
      title: 'Email',
      type: 'string',
      fieldset: 'customer',
      validation: (Rule) => Rule.required().email(),
      description: 'Required - the private quote link is emailed here.',
    }),
    defineField({
      name: 'customerPhone',
      title: 'Phone',
      type: 'string',
      fieldset: 'customer',
    }),
    defineField({
      name: 'customerAddress',
      title: 'Address',
      type: 'text',
      rows: 3,
      fieldset: 'customer',
    }),

    // ---- Rep ----
    defineField({
      name: 'repName',
      title: 'Your name',
      type: 'string',
      fieldset: 'rep',
      // The logged-in Studio user is the person building the quote.
      initialValue: (_params, context) => context.currentUser?.name ?? 'Patrick Black',
    }),
    defineField({
      name: 'repEmail',
      title: 'Your email',
      type: 'string',
      fieldset: 'rep',
      validation: (Rule) => Rule.email(),
      initialValue: (_params, context) => context.currentUser?.email ?? 'patrick@perfectimprints.com',
    }),
    defineField({
      name: 'repPhone',
      title: 'Your phone',
      type: 'string',
      fieldset: 'rep',
      // Sourced from Global Settings (Contact Info) so the number is not
      // hardcoded twice; falls back to the legacy field, then the known
      // company line.
      initialValue: async (_params, context) => {
        try {
          const client = context.getClient({ apiVersion: '2024-10-01' });
          const settings = await client.fetch<{
            contactPhone?: string;
            legacyPhone?: string;
          } | null>(
            `*[_id == "globalSettings"][0]{ "contactPhone": contact.phones[0], "legacyPhone": phoneNumber }`,
          );
          return settings?.contactPhone || settings?.legacyPhone || '800-773-9472';
        } catch {
          return '800-773-9472';
        }
      },
    }),

    // ---- Dates ----
    defineField({
      name: 'quoteDate',
      title: 'Quote date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
    defineField({
      name: 'expiryDate',
      title: 'Expiry date',
      type: 'date',
      fieldset: 'dates',
      description: 'Defaults to 30 days after creation - change it freely.',
      initialValue: () =>
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }),

    // ---- Line items ----
    defineField({
      name: 'lineItems',
      title: 'Line items',
      type: 'array',
      of: [
        { type: 'quoteGeigerLine' },
        { type: 'quoteOwnProductLine' },
        { type: 'quoteCustomLine' },
        { type: 'quoteChargeLine' },
      ],
      description:
        'Products and charges on this quote, in the order they should appear. Prices entered here are frozen on the quote - see each line\'s fields.',
    }),

    // ---- Totals ----
    defineField({
      name: 'salesTax',
      title: 'Sales tax (USD)',
      type: 'number',
      fieldset: 'totals',
      validation: (Rule) => Rule.min(0),
      description:
        'Type the tax amount in dollars. It is NOT calculated - whatever you enter here is added to the grand total as-is. Leave blank for no tax.',
    }),
    defineField({
      // Display-only: the custom input computes from lineItems + salesTax and
      // never writes a value (totals are NEVER stored on the document).
      name: 'computedTotals',
      title: 'Totals (computed)',
      type: 'string',
      fieldset: 'totals',
      readOnly: true,
      components: { input: QuoteTotalsInput },
    }),

    // ---- Sending & responses ----
    defineField({
      name: 'sentAt',
      title: 'Sent at',
      type: 'datetime',
      fieldset: 'sending',
      readOnly: true,
      description:
        'Set automatically when the quote is emailed to the customer. Sending arrives in a later update.',
    }),
    defineField({
      // Display-only: lists this quote's quoteResponse records (read-only
      // documents written by the future customer routes). Stores nothing.
      name: 'responses',
      title: 'Responses',
      type: 'string',
      fieldset: 'sending',
      readOnly: true,
      components: { input: QuoteResponsesInput },
    }),
  ],
  orderings: [
    {
      title: 'Quote number (newest first)',
      name: 'quoteNumberDesc',
      by: [{ field: 'quoteNumber', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      quoteNumber: 'quoteNumber',
      title: 'title',
      company: 'customerCompany',
      email: 'customerEmail',
      sentAt: 'sentAt',
    },
    prepare({ quoteNumber, title, company, email, sentAt }) {
      const label = title || company || email || 'Untitled quote';
      return {
        title: quoteNumber ? `${quoteNumber} - ${label}` : label,
        subtitle: sentAt ? `Sent ${new Date(sentAt).toLocaleDateString('en-US')}` : 'Not sent yet',
      };
    },
  },
});

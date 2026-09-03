import { defineField, defineType } from 'sanity';
import { portableBody } from '../objects/page-sections';
import {
  productStripEntryDescription,
  productStripEntryMembers,
} from '../objects/blog-products';

/**
 * Reserved top-level slugs a `landingPage` must not use — the SAME list the
 * `page` schema enforces (each slug is owned by another route: a top-level /
 * folder route, /api, the obfuscated Studio, or one of the eight fixed
 * footer/legal pages). A landingPage renders at `/<slug>` via the ROOT
 * CATCH-ALL app/[...slug]/page.tsx, resolved BEFORE `page` docs (a slug used by
 * both renders the landing page). Mirrored from lib/reserved-slugs.ts (the
 * standalone Studio bundler can't import from lib/) — keep the three lists
 * (lib/reserved-slugs.ts, page.ts, this one) in sync.
 *
 * UNLIKE the `page` schema, this list ALSO blocks the four Services page slugs
 * (kitting, company-stores, popup-stores, custom-products — the route's
 * ROUTE_RESERVED set). The page schema deliberately allows them because the
 * Services docs ARE page docs rendering at /services/<slug>; a landingPage has
 * no /services/ render path, so publishing one at those slugs would 404
 * everywhere — better to reject it at publish time.
 */
const RESERVED_SLUGS = [
  'cat',
  'blog',
  'videos',
  'brands',
  'deals',
  'new-products',
  'rush-products',
  'rush-promotional-products',
  'promotional-products',
  'products',
  'shop-by-theme',
  'quote',
  'portfolio',
  'faq',
  'search',
  'services',
  'admin3773752',
  'api',
  'about',
  'contact',
  'terms',
  'privacy-security',
  'returns',
  'shipping-policy',
  'sample-policy',
  'company-core-values',
  // Services page slugs (landingPage-only additions — see the note above).
  'kitting',
  'company-stores',
  'popup-stores',
  'custom-products',
];

/**
 * Local + topic landing page (P2-AI-005 part 1 — Patrick's Phase 2D flagship).
 *
 * A FIXED high-converting template (hero → local intro → options & ideas +
 * product strip → why us → FAQ → lead form) rendered at a top-level SEO slug
 * (e.g. /screen-printing-sylva-nc) through the root catch-all
 * app/[...slug]/page.tsx. The targeting inputs (city, state, product, the
 * MUST-INCLUDE landmarks, keywords) drive the "Generate Landing Page with AI"
 * document action, which drafts every content field for review — nothing
 * auto-publishes, and every generated field stays editable.
 *
 * The quote form (part 2) routes each page's lead email to that page's
 * `leadRecipient` (resolved SERVER-SIDE from the slug — the browser never
 * sends a recipient address) and emails the customer an automatic
 * confirmation; `heroCtaLabel` + `leadFormHeading` make the CTA wording
 * editable with automatic defaults.
 */
export default defineType({
  name: 'landingPage',
  title: 'Landing Page',
  type: 'document',
  fieldsets: [
    // Targeting inputs consumed ONLY by the "Generate Landing Page with AI"
    // action + /api/sanity/generate-landing. City/State/Product also feed the
    // Service JSON-LD; landmarks/keywords never render on the live page.
    {
      name: 'targeting',
      title: 'AI generation inputs (what this page targets)',
      description:
        'Fill City, State, Product, the local landmarks to mention, and optional keywords, then click "Generate Landing Page with AI" (near Publish). The AI drafts the hero, local intro (naming every landmark), options & ideas, why-us section, FAQs, and a related-products strip for you to review and edit. Nothing publishes automatically.',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'ai',
      title: 'AI output log (not shown on the live page)',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Internal / display label, e.g. "Screen Printing Sylva NC".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description:
        'The SEO URL this landing page renders at, e.g. "screen-printing-sylva-nc" → /screen-printing-sylva-nc. The AI action fills it from Product + City + State when empty.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.required().custom((slug?: { current?: string }) => {
          const current = slug?.current;
          if (current && RESERVED_SLUGS.includes(current)) {
            return 'This URL is reserved by the site; choose another slug.';
          }
          return true;
        }),
    }),

    // -----------------------------------------------------------------------
    // Targeting inputs (drive AI generation)
    // -----------------------------------------------------------------------
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      fieldset: 'targeting',
      description: 'e.g. "Destin" or "Sylva".',
    }),
    defineField({
      name: 'state',
      title: 'State',
      type: 'string',
      fieldset: 'targeting',
      description: 'e.g. "FL" or "NC".',
    }),
    defineField({
      name: 'product',
      title: 'Product / topic',
      type: 'string',
      fieldset: 'targeting',
      description:
        'The specific product or service this page is about, e.g. "Screen Printing", "Custom Beach Towels", "Custom Koozies".',
    }),
    defineField({
      name: 'landmarks',
      title: 'Local landmarks (must be mentioned)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'targeting',
      description:
        'Local landmarks to weave into the copy. The AI will definitely include these. Example for Destin FL: Crab Island, Henderson Beach State Park, Destin Harbor, HarborWalk Village, Okaloosa County.',
    }),
    defineField({
      name: 'aiTopicKeywords',
      title: 'Topic Keywords (optional)',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      fieldset: 'targeting',
      description:
        'Optional. A few plural keywords (e.g. "custom beach towels") that steer the product strip and the internal links.',
    }),

    // -----------------------------------------------------------------------
    // AI-generated, editable template content
    // -----------------------------------------------------------------------
    defineField({
      name: 'heroHeading',
      title: 'Hero heading (H1)',
      type: 'string',
    }),
    defineField({
      name: 'heroSubheading',
      title: 'Hero subheading',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'heroCtaLabel',
      title: 'Hero button label',
      type: 'string',
      description:
        'The big button under the hero text (it jumps to the quote form). Blank uses "Request a Quote".',
      initialValue: 'Request a Quote',
    }),
    portableBody('localIntro', 'Local intro (mentions the landmarks)'),
    portableBody('optionsIdeas', 'Options & ideas (the main content)'),
    portableBody('whyUs', 'Why Perfect Imprints (trust section)'),
    defineField({
      name: 'relatedProducts',
      title: 'Related products',
      type: 'array',
      of: productStripEntryMembers,
      description: `Shown as a live product strip inside the Options & Ideas section. ${productStripEntryDescription} The AI pre-fills SKU entries; add or remove any.`,
    }),
    // Portfolio gallery (PORT-120): the shared block in a FIXED position in
    // the template, after Options & Ideas + the product strip and before
    // "Why Perfect Imprints". Patrick does not move it here; the blog body
    // is the free-placement surface. The AI never touches it.
    defineField({
      name: 'portfolioGallery',
      title: 'Portfolio gallery',
      type: 'portfolioGallery',
      description:
        'Photos of work you have produced (Portfolio items), shown after the Options & Ideas section and before "Why Perfect Imprints". Hand pick the items or fill it from a category. Leave it empty for no gallery.',
    }),
    defineField({
      name: 'faqs',
      title: 'FAQs',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'question', type: 'string', title: 'Question' },
            { name: 'answer', type: 'text', rows: 4, title: 'Answer' },
          ],
          preview: { select: { title: 'question' } },
        },
      ],
    }),

    // -----------------------------------------------------------------------
    // Lead form config (P2-AI-005 part 2)
    // -----------------------------------------------------------------------
    defineField({
      name: 'leadFormHeading',
      title: 'Quote form heading',
      type: 'string',
      description:
        'The heading above the quote form. Blank uses "Request a Quote in {City}, {State}".',
    }),
    defineField({
      name: 'leadRecipient',
      title: 'Lead recipient email',
      type: 'string',
      description:
        "Lead notifications from THIS page's quote form go to this email (the customer also gets an automatic confirmation copy of their submission). Blank or invalid falls back to patrick@perfectimprints.com.",
      initialValue: 'patrick@perfectimprints.com',
      validation: (Rule) =>
        Rule.custom((value?: string) => {
          if (!value) return true;
          return /^\S+@\S+\.\S+$/.test(value) ? true : 'Enter a valid email address.';
        }),
    }),

    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),

    defineField({
      name: 'aiSuggestedLinks',
      title: 'Suggested Internal Links',
      type: 'array',
      fieldset: 'ai',
      description:
        'Internal links the AI found and whether each was placed in the body. Not shown on the live page.',
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
    select: { title: 'title', slug: 'slug.current', city: 'city', product: 'product' },
    prepare: ({
      title,
      slug,
      city,
      product,
    }: {
      title?: string;
      slug?: string;
      city?: string;
      product?: string;
    }) => ({
      title: title || [product, city].filter(Boolean).join(' — ') || '(untitled landing page)',
      subtitle: slug ? `/${slug}` : 'no slug',
    }),
  },
});

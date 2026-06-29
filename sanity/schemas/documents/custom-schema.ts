import { defineField, defineType } from 'sanity';
import { PageUrlInput } from '../../components/PageUrlPicker';

/**
 * Custom structured data (JSON-LD) for ANY page (Task C Part 2).
 *
 * Keyed by the page path (`pageUrl`), this lets Patrick attach one or more raw
 * JSON-LD blocks (WebApplication, HowTo, Product, Event, …) to ANY page —
 * category, blog, video, static/legal, home, brands, deals/new/rush, /faq,
 * /videos — WITHOUT taking the page over or pushing it to Sanity. It is the same
 * "one doc per page you want to touch" model as `categoryOverride`.
 *
 * The `CustomSchemaJsonLd` server component reads the doc(s) for the current
 * path via a cache-tagged fetch and emits each block as a
 * `<script type="application/ld+json">`. Each block is validated here as
 * parseable JSON with `@context` + `@type`, so a broken block can't be published.
 *
 * Two ways to fill `jsonLd[]` (Task C-2):
 *   Option 1 — paste a raw JSON-LD object from a schema-markup generator.
 *   Option 2 — pick `schemaType` (+ optional `aiContext`) and click the
 *     "Generate schema with AI" document action, which appends one validated
 *     block via /api/sanity/generate-schema (DeepSeek). Both coexist.
 */

// Curated AI-generatable types — deliberately EXCLUDES the schemas the site
// already emits automatically (FAQPage, Organization, WebSite, BreadcrumbList,
// VideoObject, CollectionPage, BlogPosting) to avoid duplicates. Mirrored in
// app/api/sanity/generate-schema/route.ts (the Studio bundler can't import the
// app dir, so the list is duplicated, not shared).
const AI_SCHEMA_TYPES = [
  { title: 'Web Application', value: 'WebApplication' },
  { title: 'Software Application', value: 'SoftwareApplication' },
  { title: 'Product', value: 'Product' },
  { title: 'Service', value: 'Service' },
  { title: 'Offer', value: 'Offer' },
  { title: 'How-To (step-by-step guide)', value: 'HowTo' },
  { title: 'Article', value: 'Article' },
  { title: 'Event', value: 'Event' },
  { title: 'Review', value: 'Review' },
  { title: 'Aggregate Rating', value: 'AggregateRating' },
  { title: 'Item List', value: 'ItemList' },
];

export default defineType({
  name: 'customSchema',
  title: 'Custom Schema (Structured Data)',
  type: 'document',
  fields: [
    defineField({
      name: 'pageUrl',
      title: 'Page URL (path)',
      type: 'string',
      description:
        'The page this schema is added to. Search a category to target a /cat/... page, or type any exact path for other pages (e.g. /about, /blog/my-post, /videos/my-video, or / for the home page). No domain, no trailing slash (except the home page "/").',
      components: { input: PageUrlInput },
      validation: (Rule) =>
        Rule.required().custom((value) => {
          if (typeof value !== 'string' || !value.trim()) return 'Required.';
          const v = value.trim();
          if (/^https?:\/\//i.test(v) || v.includes('://')) {
            return 'Use a site-relative path, not a full URL (no domain).';
          }
          if (!v.startsWith('/')) return 'Path must start with "/".';
          if (v !== '/' && v.endsWith('/')) return 'No trailing slash (except the home page "/").';
          if (v.includes('//')) return 'Path contains a double slash.';
          return true;
        }),
    }),
    defineField({
      name: 'label',
      title: 'Label (optional note)',
      type: 'string',
      description:
        'Optional note to help you tell entries apart in the list (e.g. "Water Bottles — Product schema"). Not rendered on the page.',
    }),
    defineField({
      name: 'schemaType',
      title: 'Schema type (for AI generation)',
      type: 'string',
      description:
        'Optional — only used by the "Generate schema with AI" button. Pick a type, optionally add details below, then click the button to append a ready-made JSON-LD block you can review. FAQPage, Organization, WebSite, Breadcrumb, and VideoObject are NOT listed because the site already adds those automatically on the right pages.',
      options: {
        list: AI_SCHEMA_TYPES,
        layout: 'dropdown',
      },
    }),
    defineField({
      name: 'aiContext',
      title: 'Details for AI (optional)',
      type: 'text',
      rows: 3,
      description:
        'Optional specifics for the AI to use, e.g. "free web-based app for designing custom mugs" or "2-day screen-printing service, $50 minimum". The more you say, the better the generated block.',
    }),
    defineField({
      name: 'jsonLd',
      title: 'JSON-LD blocks',
      type: 'array',
      of: [
        {
          type: 'text',
          rows: 12,
          validation: (Rule) =>
            Rule.custom((value) => {
              const raw = typeof value === 'string' ? value.trim() : '';
              if (!raw) return 'Paste a JSON-LD object, or remove this empty block.';
              let parsed: unknown;
              try {
                parsed = JSON.parse(raw);
              } catch {
                return 'Not valid JSON. Paste a single JSON-LD object (use a schema-markup generator if needed).';
              }
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return 'Must be a single JSON object ({ … }), not an array or value.';
              }
              const obj = parsed as Record<string, unknown>;
              if (!('@context' in obj)) return 'Missing "@context" (e.g. "https://schema.org").';
              if (!('@type' in obj)) return 'Missing "@type" (e.g. "Product", "WebApplication").';
              return true;
            }),
        },
      ],
      description:
        'One or more JSON-LD objects. Two ways to add a block: (1) paste raw JSON from a schema-markup generator, or (2) pick a Schema type above and click "Generate schema with AI". Each block must be valid JSON with "@context" and "@type". Do NOT re-add FAQPage, Organization, WebSite, Breadcrumb, or VideoObject — the site already emits those automatically on the relevant pages, so adding them here would duplicate them.',
      validation: (Rule) => Rule.min(1).error('Add at least one JSON-LD block.'),
    }),
  ],
  preview: {
    select: {
      pageUrl: 'pageUrl',
      label: 'label',
      jsonLd: 'jsonLd',
    },
    prepare({ pageUrl, label, jsonLd }) {
      const count = Array.isArray(jsonLd) ? jsonLd.length : 0;
      const blocks = `${count} ${count === 1 ? 'block' : 'blocks'}`;
      return {
        title: pageUrl || '(no page URL)',
        subtitle: label ? `${label} · ${blocks}` : blocks,
      };
    },
  },
});

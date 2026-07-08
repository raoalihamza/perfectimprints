/**
 * Reserved top-level slugs — slugs a `page` document must NOT use.
 *
 * A published `page` renders at `/<slug>` via the top-level dynamic route
 * (app/[slug]/page.tsx). Every slug listed here is already owned by another
 * route — a static/literal top-level route (`/blog`, `/deals`, …), a folder
 * route (`/cat`, `/services`, `/brands`, …), the obfuscated Studio
 * (`/admin3773752`), the API namespace (`/api`), or one of the eight fixed
 * footer/legal static pages (`/about`, `/contact`, `/terms`, …). The dynamic
 * route serves ONLY slugs NOT in this set, and the `page` schema rejects
 * creating a document at one of these slugs.
 *
 * Route-precedence note: in the Next.js App Router a literal segment and a
 * dedicated folder route always beat a root catch-all, so these routes win
 * regardless — this set is defence-in-depth (and keeps duplicate content from
 * ever rendering) rather than the sole guard. The route is a root catch-all
 * (app/[...slug]), so multi-segment page slugs (e.g. `industry/hvac`) render at
 * their full path; dedicated folder routes (`/cat/...`, `/services/...`) still
 * beat it because a more specific route always wins over a root catch-all.
 *
 * NOTE: the individual Services page-doc slugs (`kitting`, `company-stores`, …)
 * are intentionally NOT listed here — they are valid `page` docs that already
 * render at `/services/<slug>`, so blocking them in the schema would flag those
 * existing docs as invalid. The top-level route + sitemap exclude them
 * separately (derived from the Services nav) so they don't ALSO render at
 * `/<slug>`; see app/[slug]/page.tsx.
 *
 * Mirrored inline in sanity/schemas/documents/page.ts (the standalone Studio
 * bundler can't import from lib/) — keep the two lists in sync.
 */
export const RESERVED_SLUGS: readonly string[] = [
  // Existing top-level folder / literal routes
  'cat',
  'blog',
  'videos',
  'brands',
  'deals',
  'new-products',
  'rush-products',
  'rush-promotional-products',
  'promotional-products',
  // Custom product detail pages (P2-CP-001) — the /products/[slug] folder route.
  'products',
  'faq',
  'search',
  'services',
  'admin3773752',
  'api',
  // The eight fixed footer/legal static pages (their own top-level routes)
  'about',
  'contact',
  'terms',
  'privacy-security',
  'returns',
  'shipping-policy',
  'sample-policy',
  'company-core-values',
];

export const RESERVED_SLUG_SET: ReadonlySet<string> = new Set(RESERVED_SLUGS);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUG_SET.has(slug);
}

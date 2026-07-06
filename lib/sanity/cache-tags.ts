/**
 * Cache tags for the `/cat/<slug>` render path (M5-504 hybrid restore).
 *
 * Every Sanity read used while rendering a category page is a cache-TAGGED fetch
 * (never `no-store`), so the route stays statically prerenderable AND the webhook
 * can revalidate edits in seconds:
 *   - `CATEGORY_CONTROL_TAG` — the shared owned/edited slug sets. Busted when a
 *     customCategory / categoryOverride / productPlacement is published or
 *     removed (i.e. when set membership can change).
 *   - `categoryTag(slug)` — a single category's per-slug content (its
 *     customCategory + categoryOverride + productPlacement reads share this tag).
 *     Busted on publish of any of those docs for that slug.
 *
 * Pure module (no `server-only`, no imports) so the webhook and the query
 * modules can both depend on it.
 */

export const CATEGORY_CONTROL_TAG = 'category-control-sets';

/**
 * Related-blogs shown on root category pages (RelatedBlogsSection). A global tag
 * busted on any `blogPost` publish so the section stays fresh while the read
 * remains cached (not `no-store`, so it doesn't force the route dynamic).
 */
export const RELATED_BLOGS_TAG = 'related-blogs';

/**
 * Answered FAQs shown on the `/faq` library page + the live search delta. A
 * global tag busted on any `faq` publish. The reads go through the non-CDN
 * `cachedClient` (so revalidation always sees fresh data, never a stale CDN
 * copy) while staying cache-tagged — keeping `/faq` ISR-static.
 */
export const FAQS_TAG = 'faqs';

/**
 * Videos shown on `/videos` (index) + `/videos/<slug>` (detail) + the live
 * search delta. A global tag busted on any `video` publish. Same rationale as
 * FAQS_TAG: read through the non-CDN `cachedClient` so revalidation always sees
 * fresh data (no stale-CDN re-cache), while staying cache-tagged.
 */
export const VIDEOS_TAG = 'videos';

/**
 * Brands used on the `/brands` index (the Featured Brands strip + A–Z grid) and
 * `/brands/<slug>` pages. A global tag busted on any `brand` publish/delete. The
 * Sanity read goes through the non-CDN `cachedClient` (so a `featured` toggle is
 * picked up deterministically, not behind a CDN-propagation race), while staying
 * cache-tagged — keeping `/brands` static/ISR. Same rationale as FAQS_TAG/VIDEOS_TAG.
 */
export const BRANDS_TAG = 'brands';

/**
 * Layout singletons rendered in the shared chrome (Header / Footer / Organization
 * JSON-LD). Both reads (`getSiteSettings`, `getMegaMenu`) go through the non-CDN
 * `cachedClient` and carry the matching tag; the webhook `revalidateTag`s them on
 * `globalSettings` / `megaMenu` publish IN ADDITION TO `revalidatePath('/','layout')`.
 *
 * Why the tag is needed (and `revalidatePath('/','layout')` alone was not enough):
 * these reads previously used the CDN `client` (`useCdn:true`) with NO tag, so a
 * publish (e.g. REMOVING a footer link) stayed stale — the CDN serves its own
 * ~60s copy AND the untagged fetch wasn't deterministically busted by the path
 * revalidation. Same defect class already fixed for FAQs / videos / brands.
 */
export const SETTINGS_TAG = 'global-settings';
export const MEGA_MENU_TAG = 'mega-menu';

// ---------------------------------------------------------------------------
// Tag-value sanitizer (production-incident hardening, 2026-07-02)
//
// Next/Vercel reject a request's `x-next-cache-tags` header when ANY tag on the
// render is invalid (empty, or containing a character outside the allowed set),
// and the WHOLE response then 500s. The root catch-all `app/[...slug]` runs a
// tagged Sanity fetch (`pageTag`/`customSchemaTag`) for EVERY unmatched
// top-level path BEFORE it `notFound()`s, so bot junk (`/wp-login.php`,
// `%`-encodings, uppercase, dots, …) built a bad tag and 500'd instead of 404'ing.
//
// `sanitizeTagValue` normalizes any slug/path into a tag-safe token: lowercase,
// KEEP `/ _ -` (so existing `cat:water-bottles/color/blue` and `customSchema:/`
// tags are byte-identical — no churn on the working `/cat` path), map every
// other run of characters to a single `-`, trim, and length-cap well under
// Next's 256 limit (hash the tail if a pathological value overflows). Empty in →
// empty out, and the tag builders return '' for that so callers can drop it
// (`.filter(Boolean)`) — a tag is NEVER emitted as a bare `base:` with nothing.
//
// Because the read path AND the webhook both call these SAME builders, the tags
// stay consistent, so `revalidateTag` still busts exactly what the fetch tagged
// — freshness is preserved, only invalid tags are prevented.
// ---------------------------------------------------------------------------

/** Max length for a single cache tag (Next's limit is 256 — stay well under). */
const MAX_TAG_VALUE_LENGTH = 200;

function hashToken(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Normalize an arbitrary slug/path into a cache-tag-safe token. Returns '' for
 * empty/undefined/whitespace-only or all-invalid input (caller drops it). Keeps
 * `/`, `_`, `-`, `a-z`, `0-9` so already-valid slugs/paths are unchanged.
 */
export function sanitizeTagValue(value: string | undefined | null): string {
  if (!value) return '';
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-') // any invalid run -> single '-'
    .replace(/-{2,}/g, '-') // collapse dash runs
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes (slashes kept)
  if (!token) return '';
  if (token.length <= MAX_TAG_VALUE_LENGTH) return token;
  // Pathologically long value: truncate + append a short hash for uniqueness.
  return `${token.slice(0, MAX_TAG_VALUE_LENGTH - 9)}-${hashToken(token)}`;
}

/**
 * Per-slug content tag, e.g. `cat:water-bottles` or `cat:water-bottles/color/blue`.
 * Returns '' for an empty/invalid slug (caller filters it out) so the render
 * never emits a bare `cat:` and 500s the `x-next-cache-tags` header.
 */
export function categoryTag(slug: string): string {
  const s = sanitizeTagValue(slug);
  return s ? `cat:${s}` : '';
}

/**
 * Generic section-based `page` documents — powering Services (/services/<slug>),
 * the footer/legal static pages (/about, /terms, …), and top-level custom pages
 * (`/<slug>` via app/[slug]). `PAGES_TAG` is the list-level tag busted on any
 * `page` publish/delete so generateStaticParams + the sitemap pick up a new or
 * removed slug; `pageTag(slug)` busts a single page's content. All `page` reads
 * (getPageBySlug / getAllPageSlugs) go through the non-CDN `cachedClient` so a
 * publish revalidates deterministically (no stale-CDN race) while staying
 * cache-tagged — keeping /services/<slug> and /<slug> static/SSG. Same rationale
 * as FAQS_TAG / VIDEOS_TAG / BRANDS_TAG.
 */
export const PAGES_TAG = 'pages';
export function pageTag(slug: string): string {
  const s = sanitizeTagValue(slug);
  return s ? `page:${s}` : '';
}

/**
 * Local/topic `landingPage` documents (P2-AI-005) — rendered at `/<slug>` via
 * the root catch-all app/[...slug] (resolved BEFORE `page` docs). `LANDING_TAG`
 * is the list-level tag busted on any `landingPage` publish/delete so
 * generateStaticParams + the sitemap + the internal-link engine pick up a new
 * or removed slug; `landingTag(slug)` busts a single landing page's content.
 * All landingPage reads go through the non-CDN `cachedClient` so a publish
 * revalidates deterministically while staying cache-tagged — keeping `/<slug>`
 * static/SSG. Same rationale as PAGES_TAG.
 */
export const LANDING_TAG = 'landing-pages';
export function landingTag(slug: string): string {
  const s = sanitizeTagValue(slug);
  return s ? `landing:${s}` : '';
}

/**
 * Per-path tag for the custom structured-data injector (Task C). Keyed by the
 * full page path (e.g. `customSchema:/cat/water-bottles`, `customSchema:/about`,
 * `customSchema:/`). The `CustomSchemaJsonLd` server component reads through a
 * cache-tagged fetch (revalidate:false, never `no-store`) so the host page stays
 * statically prerenderable; the webhook busts this exact tag on `customSchema`
 * publish/delete so an edit goes live in seconds.
 */
export function customSchemaTag(path: string): string {
  const s = sanitizeTagValue(path);
  return s ? `customSchema:${s}` : '';
}

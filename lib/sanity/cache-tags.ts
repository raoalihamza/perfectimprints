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

/** Per-slug content tag, e.g. `cat:water-bottles` or `cat:water-bottles/color/blue`. */
export function categoryTag(slug: string): string {
  return `cat:${slug}`;
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
  return `customSchema:${path}`;
}

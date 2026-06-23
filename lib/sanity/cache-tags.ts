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

/** Per-slug content tag, e.g. `cat:water-bottles` or `cat:water-bottles/color/blue`. */
export function categoryTag(slug: string): string {
  return `cat:${slug}`;
}

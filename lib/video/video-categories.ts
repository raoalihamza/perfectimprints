/**
 * Multi-category videos (Q-180 improvement 1) - the pure rules, in one place.
 *
 * The `video` document's category moved from a single reference (`category`)
 * to a list (`categories`). The data is NOT destructively migrated: every read
 * path projects BOTH fields and normalizes through `effectiveVideoCategories`
 * below (the decoration-methods precedent - legacy shape keeps working, a
 * separate idempotent migration script converts at leisure:
 * scripts/migrations/migrate-video-categories.ts).
 *
 * Pure and dependency-free so both the server query module and the card-data
 * mapper share ONE definition of "which categories does this video have", and
 * so the rules are unit-testable.
 */

export interface VideoCategoryRef {
  title: string;
  slug: string;
}

export interface RawVideoCategoryFields {
  /** New list field. Dangling references project as null entries. */
  categories?: (VideoCategoryRef | null)[] | null;
  /** Legacy single reference, still honored until the migration runs. */
  legacyCategory?: VideoCategoryRef | null;
}

/**
 * The effective category list for a video: the new `categories` list when it
 * has at least one resolvable entry, else the legacy single `category` as a
 * one-item list, else empty. Null/dangling entries are dropped; duplicates
 * (same slug) collapse to the first occurrence.
 */
export function effectiveVideoCategories(raw: RawVideoCategoryFields): VideoCategoryRef[] {
  const list = (raw.categories ?? []).filter(
    (c): c is VideoCategoryRef => Boolean(c?.slug && c?.title),
  );
  const source =
    list.length > 0
      ? list
      : raw.legacyCategory?.slug && raw.legacyCategory?.title
        ? [raw.legacyCategory]
        : [];
  const seen = new Set<string>();
  const out: VideoCategoryRef[] = [];
  for (const c of source) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push(c);
  }
  return out;
}

export interface RelatedVideoCandidate<T> {
  item: T;
  slug: string;
  categorySlugs: string[];
}

/**
 * Related-videos ranking for a multi-category video: any shared category makes
 * a candidate related, and MORE shared categories rank higher. Ties keep the
 * input order, so passing candidates newest-first (the getAllVideos order)
 * keeps the old "newest first" behavior within each shared-count band. With a
 * single category on both sides this reduces exactly to the previous
 * "same category, newest first" rule. The video itself is always excluded.
 */
export function rankRelatedVideos<T>(
  candidates: RelatedVideoCandidate<T>[],
  selfSlug: string,
  selfCategorySlugs: string[],
  limit: number,
): T[] {
  const mine = new Set(selfCategorySlugs.filter(Boolean));
  if (mine.size === 0 || limit <= 0) return [];
  const scored: { item: T; shared: number }[] = [];
  for (const c of candidates) {
    if (!c.slug || c.slug === selfSlug) continue;
    const shared = new Set(c.categorySlugs.filter((s) => mine.has(s))).size;
    if (shared > 0) scored.push({ item: c.item, shared });
  }
  // Array.prototype.sort is stable: equal shared counts keep candidate order.
  scored.sort((a, b) => b.shared - a.shared);
  return scored.slice(0, limit).map((s) => s.item);
}

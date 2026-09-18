/**
 * The catalog key vocabulary, and the Studio warning for a key that matches no
 * scraped catalog (FIX-881, 2026-09-18).
 *
 * `catalogPage.catalogKey` names an entry in data/geiger/catalogs.json by the
 * Phase I scraper's STABLE slug. A key that matches nothing is not an error
 * anywhere downstream: `readScrapedCatalog` in lib/catalogs.ts answers it with
 * an empty catalog (the same shape the two manual-only catalogs ship with), so
 * the gated page renders its calm "Products are on their way" state, the
 * landing preview strip is empty, the Browse Catalog button is absent, and the
 * AI grounding degrades to thematic copy. None of those four says why. Patrick
 * typed `holidayguide` (copied from Geiger's own address, /c/holidayguide),
 * opened his own gated link, saw no products, and asked whether they import
 * automatically (FIX-880). One missing dash cost him an afternoon.
 *
 * This module is the ONE place the key list is spelled in TypeScript: the
 * schema imports it for the field's help text and for the warning rule, and
 * catalog-key.test.ts re-derives it from catalogs.json AND from the scraper's
 * own CATALOGS list, so it cannot drift from either. The warning is a WARNING
 * and never an error, on purpose: a catalog added to the scraper must be
 * publishable the day it exists, before this list is updated, and a yellow
 * flag still shows on the field and in the publish dialog. Dependency-free
 * (the raw-html.ts precedent) so the Studio bundle can import it and vitest
 * can test it.
 */

/**
 * The catalog keys shipping in data/geiger/catalogs.json today, in the file's
 * order (the scraper's `CATALOGS` list in scripts/scrapers/geiger/scrape_catalogs.py).
 * Retail Collective and Trend Talk have no scraped products; their key still
 * resolves the Browse link. Do not rename a key once a catalog page uses it.
 */
export const CURRENT_CATALOG_KEYS: readonly string[] = [
  'ideas',
  'green-guide',
  'womens-collection',
  'holiday-guide',
  'usa-made',
  'retail-collective',
  'trend-talk',
];

/**
 * A key with its separators and case removed, so `holidayguide`,
 * `Holiday-Guide`, `holiday_guide` and `holiday guide` all reduce to the same
 * string as `holiday-guide`. Used only to FIND the near match; the stored value
 * is never rewritten.
 */
export function looseCatalogKey(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, '');
}

/**
 * The known key the typed value differs from only by dashes, underscores,
 * spaces or case, or null when there is none. A value that already IS a known
 * key needs no correction and also returns null.
 */
export function nearestCatalogKey(
  value: string,
  keys: readonly string[] = CURRENT_CATALOG_KEYS,
): string | null {
  const typed = value.trim();
  if (!typed || keys.includes(typed)) return null;
  const loose = looseCatalogKey(typed);
  if (!loose) return null;
  return keys.find((key) => looseCatalogKey(key) === loose) ?? null;
}

/** How much of a long stray value the message repeats back. */
const SHOWN_MAX = 40;

/**
 * The Studio message for `catalogKey`, or null when the value is a known key
 * (or blank, which the separate required rule reports).
 *
 * Says the three things FIX-880 found missing: the key must match exactly, it
 * is not the Geiger web address, and what the current keys are. When the typed
 * value is one separator or one case away from a known key it names that key,
 * which for `holidayguide` is the sentence that would have saved the afternoon.
 * Surrounding whitespace is treated the same way, because the field's shape
 * rule trims before testing while the render path reads the stored value as
 * typed, so `"holiday-guide "` would pass the shape rule and still load nothing.
 */
export function catalogKeyWarning(
  value: unknown,
  keys: readonly string[] = CURRENT_CATALOG_KEYS,
): string | null {
  if (typeof value !== 'string') return null;
  if (!value.trim()) return null;
  if (keys.includes(value)) return null;

  const list = keys.join(', ');
  const rule = `The key is not the Geiger web address: type it exactly as listed, dash included. Current keys: ${list}.`;

  const trimmed = value.trim();
  if (keys.includes(trimmed)) {
    return `"${trimmed}" has a space before or after it, so it would not match and no Geiger products would load on this catalog's pages. Remove the space. ${rule}`;
  }

  const shown = trimmed.length > SHOWN_MAX ? `${trimmed.slice(0, SHOWN_MAX)}...` : trimmed;
  const opening = `"${shown}" is not one of the catalog keys, so no Geiger products would load on this catalog's pages.`;
  const near = nearestCatalogKey(trimmed, keys);
  if (near) return `${opening} Did you mean "${near}"? ${rule}`;
  return `${opening} ${rule} If this is a brand-new catalog we have only just added to the scraper, you can publish anyway.`;
}

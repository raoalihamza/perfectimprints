/**
 * The ONE place an AI product suggestion becomes a stored strip entry (FIX-871).
 *
 * A product strip (a blog body's `blogProducts` block, the page-builder
 * `productStrip` section, `landingPage.relatedProducts`, `video.relatedProducts`)
 * accepts exactly two stored entry shapes, and the render side reads them in
 * exactly two ways (lib/sanity/strip-product-entries.ts):
 *
 *   1. `{ _type: 'blogProduct', _key, sku }` for a GEIGER product. The SKU is
 *      resolved against products.json at render time, so nothing goes stale.
 *   2. `{ _type: 'relatedProductRef', _key, _ref }` for one of Patrick's OWN
 *      Product Pages or Custom Products. The reference is dereferenced by the
 *      GROQ projection (`defined(_ref) => @->{...}`) and normalized to a card by
 *      `stripRefToGeigerProduct`; a reference whose target is gone
 *      dereferences to null and the resolver drops it.
 *
 * The matcher (lib/ai/related-products.ts) returns Patrick's own products with
 * the synthetic SKU `custom-<_id>` that the two card normalizers synthesize.
 * That SKU is an internal id, never a catalog number: stored as shape 1 it is
 * looked up in products.json, found nowhere, has no title/image/url to fall
 * back on, and `resolveStripCards` correctly returns no card. That is FIX-870's
 * finding: for two months every Product Page the AI suggested was written in
 * the shape the render side could not read, while the same product picked by
 * hand (shape 2) rendered fine. The resolver is right; the WRITE side must
 * produce the shape the render side understands, and it must do so in one
 * place so the two halves cannot disagree again.
 *
 * Pure on purpose: no fs, no Sanity, no server-only import, so the Studio
 * actions (bundled by Sanity, which cannot take node modules), the generate
 * routes, the blog-body builder, the seed script and the repair script all
 * import the same function. `_key` generation stays with each caller (they
 * have different key patterns and this ticket does not standardise them);
 * the key function is only called for an entry that is actually kept.
 *
 * A suggestion is DROPPED, never stored as a dangling reference, when its
 * synthetic id is unusable: empty, a `drafts.` id (the published render can
 * never dereference a draft, and a strong reference to one blocks Publish),
 * a string outside Sanity's id charset, or one the optional `targetExists`
 * check rejects. At write time the generate routes need no existence check:
 * the matcher's own products come from a live read of PUBLISHED documents in
 * the same request, so a returned Product Page exists by construction. The
 * repair script is the caller that passes `targetExists`, from a query.
 */

/** The prefix both card normalizers put on a synthetic, non-catalog SKU. */
export const SYNTHETIC_SKU_PREFIX = 'custom-';

/** Stored member `_type` of a reference entry (the named array member in the schemas). */
export const STRIP_REF_TYPE = 'relatedProductRef';

/** A matcher result, or anything carrying a SKU string (a route response entry). */
export interface StripSuggestion {
  sku?: string | null;
}

/** Shape 1: a Geiger SKU, resolved live from the catalog at render. */
export interface StripSkuWriteEntry {
  _type: 'blogProduct';
  _key: string;
  sku: string;
}

/** Shape 2: a reference to a productPage / customProduct, dereferenced at render. */
export interface StripRefWriteEntry {
  _type: typeof STRIP_REF_TYPE;
  _key: string;
  _ref: string;
}

export type StripWriteEntry = StripSkuWriteEntry | StripRefWriteEntry;

export interface StripEntryWriteOptions {
  /**
   * Optional existence check for a synthetic id. Return false to drop the
   * suggestion instead of storing a reference to a document that is gone.
   * The repair script supplies this from a Sanity query; the generate routes
   * do not need it (see the module comment).
   */
  targetExists?: (id: string) => boolean;
}

/** Sanity document ids: letters, digits, `.`, `_`, `-`; must not start with `.`/`-`. */
const SANITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The document id inside a synthetic `custom-<_id>` SKU, or null for a real
 * catalog SKU. No catalog SKU starts with `custom-` (the HIDE-100 audit), so
 * the prefix alone decides. Whitespace is trimmed; the id itself is returned
 * verbatim (an empty or malformed id is still returned so the caller can
 * refuse it with a reason).
 */
export function syntheticTargetId(sku: string | null | undefined): string | null {
  const s = typeof sku === 'string' ? sku.trim() : '';
  if (!s.startsWith(SYNTHETIC_SKU_PREFIX)) return null;
  return s.slice(SYNTHETIC_SKU_PREFIX.length);
}

/** True when a synthetic id can be stored as a reference the published render can resolve. */
export function isStorableTargetId(id: string): boolean {
  return SANITY_ID_PATTERN.test(id) && !id.startsWith('drafts.');
}

/**
 * The entry to store for one suggestion, or null when it must be dropped.
 * `key` is the `_key` the caller has already allocated for a kept entry.
 */
export function stripEntryForSuggestion(
  suggestion: StripSuggestion | null | undefined,
  key: string,
  opts: StripEntryWriteOptions = {},
): StripWriteEntry | null {
  const sku = typeof suggestion?.sku === 'string' ? suggestion.sku.trim() : '';
  if (!sku) return null;
  const targetId = syntheticTargetId(sku);
  if (targetId === null) return { _type: 'blogProduct', _key: key, sku };
  if (!isStorableTargetId(targetId)) return null;
  if (opts.targetExists && !opts.targetExists(targetId)) return null;
  return { _type: STRIP_REF_TYPE, _key: key, _ref: targetId };
}

/**
 * The entries to store for an ordered list of suggestions, in the SAME order
 * (the matcher already puts Patrick's own products before Geiger's, which is
 * what he asked for). Dropped suggestions leave no gap and consume no key.
 */
export function stripEntriesForSuggestions(
  suggestions: readonly (StripSuggestion | null | undefined)[],
  nextKey: () => string,
  opts: StripEntryWriteOptions = {},
): StripWriteEntry[] {
  const out: StripWriteEntry[] = [];
  for (const suggestion of suggestions) {
    // Decide first, allocate the key second: a dropped suggestion must not
    // advance a caller's key counter (their keys stay consecutive, as today).
    const probe = stripEntryForSuggestion(suggestion, '', opts);
    if (!probe) continue;
    out.push({ ...probe, _key: nextKey() });
  }
  return out;
}

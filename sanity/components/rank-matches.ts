/**
 * Relevance ranking for the Studio search pickers (CategoryPicker /
 * ProductPicker).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Both pickers used to walk their list in file order and stop at the first 30
 * substring matches. With 22,180 categories sorted alphabetically that hides the
 * obvious answer: typing "pens" matched 246 entries, and the first 30 were
 * `apparel/supplier/hubpens`, `carpenter-pencils/supplier/hubpens` and 28
 * `dispensary-containers/*` rows — because "dis-PENS-ary" contains "pens". The
 * root `pens` category sat at position 50 and was never rendered, so Patrick
 * could not create a categoryOverride for it at all (reported 2026-08-10, as
 * "the category won't show in the search").
 *
 * The same shape hits any short slug that lives inside longer ones — bags, hats,
 * mugs, pins, caps — and the identical loop existed in ProductPicker for
 * SKU/name/brand search, where an exact SKU could sit behind dozens of
 * incidental matches.
 *
 * The lists are small enough that no index is needed: scoring all ~22k entries
 * costs a few milliseconds and runs behind the pickers' existing 180ms debounce.
 * So we score EVERY match and take the best N, instead of taking the first N and
 * never seeing the rest.
 *
 * ── TIERS (lower is better) ──────────────────────────────────────────────────
 *   0  primary is exactly the query                     `pens`
 *   1  a label is exactly the query                     title "Pens"
 *   2  primary starts with the query, on a boundary     `pens/color/blue`
 *   3  a label contains the query as a whole word       "Gel Pens"
 *   4  primary contains the query as a whole word       `writing/gel-pens`
 *   5  plain substring anywhere                         `dispensary-containers`
 *
 * A "boundary" means the match is not buried inside a longer word: the character
 * before and after must be non-alphanumeric (`-`, `/`, space) or the string
 * edge. That is what separates `gel-pens` (a real pens category) from
 * `dispensary` (a coincidence) without needing a word list.
 *
 * Ties break by depth (fewer `/` segments first, so a root category outranks its
 * own facet children), then length, then alphabetically — all deterministic, so
 * the same query always renders the same list.
 *
 * Studio-only and dependency-free: this file is bundled into the standalone
 * Studio, which cannot import from the app's `lib/` directory.
 */

export interface RankableFields {
  /** The value stored when picked — a category slug or a product SKU. */
  primary: string;
  /** Human-readable fields searched alongside it (title, name, brand…). */
  labels: string[];
}

/** Non-alphanumeric, or the edge of the string, counts as a word boundary. */
function isBoundaryChar(ch: string | undefined): boolean {
  return ch === undefined || !/[a-z0-9]/.test(ch);
}

/** True when `needle` appears in `haystack` as a whole word, not inside one. */
function hasBoundaryMatch(haystack: string, needle: string): boolean {
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    if (isBoundaryChar(haystack[i - 1]) && isBoundaryChar(haystack[i + needle.length])) {
      return true;
    }
    i = haystack.indexOf(needle, i + 1);
  }
  return false;
}

/**
 * Score one entry against an already-lowercased, already-trimmed query.
 * Returns null when it does not match at all (the caller drops it).
 */
export function matchScore(fields: RankableFields, query: string): number | null {
  if (!query) return null;
  const primary = fields.primary.toLowerCase();
  const labels = fields.labels.filter(Boolean).map((l) => l.toLowerCase());

  if (primary === query) return 0;
  if (labels.some((l) => l === query)) return 1;
  if (primary.startsWith(query) && isBoundaryChar(primary[query.length])) return 2;
  if (labels.some((l) => hasBoundaryMatch(l, query))) return 3;
  if (hasBoundaryMatch(primary, query)) return 4;
  if (primary.includes(query) || labels.some((l) => l.includes(query))) return 5;
  return null;
}

export interface RankedResult<T> {
  /** The top `limit` matches, best first. */
  items: T[];
  /** How many matched in total — lets the UI say "showing 30 of 246". */
  total: number;
}

/**
 * Score every entry, sort by relevance, return the best `limit`.
 *
 * Callers pass an already-lowercased query (both pickers lowercase inside their
 * debounce effect). `toFields` maps an entry to what should be searched.
 */
export function rankMatches<T>(
  items: readonly T[],
  query: string,
  toFields: (item: T) => RankableFields,
  limit: number,
): RankedResult<T> {
  if (!query) return { items: [], total: 0 };

  const scored: Array<{ item: T; score: number; primary: string; depth: number }> = [];
  for (const item of items) {
    const fields = toFields(item);
    const score = matchScore(fields, query);
    if (score === null) continue;
    const primary = fields.primary.toLowerCase();
    scored.push({ item, score, primary, depth: primary.split('/').length });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.depth - b.depth ||
      a.primary.length - b.primary.length ||
      a.primary.localeCompare(b.primary),
  );

  return { items: scored.slice(0, limit).map((s) => s.item), total: scored.length };
}

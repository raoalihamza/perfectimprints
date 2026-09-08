/**
 * A fixed vocabulary for a portfolio item field (PORT-160).
 *
 * The colour vocabulary (lib/portfolio/colors.ts) established the shape: one
 * constant list of stored values, imported by BOTH the Studio schema (for its
 * checkbox or dropdown options) and the site (for validation, the filter
 * groups and the URL), so the list exists in exactly one place and cannot
 * drift. Decoration methods and industries follow the same shape, but unlike
 * colours their labels are not derivable from the value ("screen-printed"
 * must read "Screen printed", "fire-and-ems" must read "Fire and EMS"), so
 * each entry carries its own title. This factory builds the helpers each
 * vocabulary module exports, the same helpers colors.ts hand-writes.
 *
 * Pure and dependency-free on purpose: the Studio bundle imports the
 * vocabulary modules directly (a relative import, the colors.ts precedent),
 * so nothing here may pull in fs, Sanity, React or `server-only`.
 */

export interface VocabularyEntry<V extends string> {
  /** The stored value and the URL value: lowercase letters, digits and single dashes. */
  value: V;
  /** The label the Studio and the filter button show. */
  title: string;
}

export interface Vocabulary<V extends string> {
  /** Stored values in vocabulary order (the order the filter buttons take). */
  values: readonly V[];
  /** `{ title, value }` pairs in vocabulary order, the shape a Sanity `options.list` takes. */
  options: readonly { title: string; value: V }[];
  /** True when `value` is one of the vocabulary values (exact, lowercase). */
  is(value: unknown): value is V;
  /** The label for a value; an unknown value comes back as typed so nothing renders blank. */
  label(value: string): string;
  /** Keep only recognised values, each once, in vocabulary order (the `normalizePortfolioColors` rule). */
  normalize(values: readonly unknown[] | null | undefined): V[];
  /** One recognised value, or null (for a single-value field such as industry). */
  normalizeOne(value: unknown): V | null;
}

/** The shape every stored value must have: it travels comma-joined in a shared link (PORT-110). */
export const VOCABULARY_VALUE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function defineVocabulary<const V extends string>(
  entries: readonly VocabularyEntry<V>[],
): Vocabulary<V> {
  const values = entries.map((e) => e.value);
  const set: ReadonlySet<string> = new Set(values);
  const titles = new Map<string, string>(entries.map((e) => [e.value, e.title]));
  const is = (value: unknown): value is V => typeof value === 'string' && set.has(value);
  return {
    values,
    options: entries.map((e) => ({ title: e.title, value: e.value })),
    is,
    label: (value) => titles.get(value) ?? value,
    normalize: (input) => {
      if (!input || input.length === 0) return [];
      const present = new Set<string>();
      for (const v of input) if (is(v)) present.add(v);
      return values.filter((v) => present.has(v));
    },
    normalizeOne: (value) => (is(value) ? value : null),
  };
}

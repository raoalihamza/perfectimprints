/**
 * The Portfolio Gallery colour vocabulary (PORT-100).
 *
 * These are NOT a new list. They are the twenty values the site already uses
 * in its `/cat/<root>/color/<value>` facet URLs: 3,193 such URLs across
 * exactly 20 distinct values, measured from data/pi-urls/category-urls.json
 * on 2026-09-02 (PORT-000 found the same figures). Reusing them means a
 * portfolio item tagged "blue" and a category filter for "blue" are the same
 * word, and it stops the free-text drift PORT-000 warned about ("navy",
 * "Navy Blue" and "dark blue" within a month).
 *
 * This is the ONE place the list lives. The Studio schema
 * (sanity/schemas/documents/portfolio-item.ts) imports it for its checkbox
 * options, and the data layer / gallery filters import it for validation. The
 * accompanying test derives the same set from the URL data file and fails if
 * this constant ever drifts from it, so the list cannot quietly diverge from
 * the vocabulary it was copied from.
 *
 * Pure and dependency-free on purpose: the Studio bundle imports it directly
 * (a relative import, the way sanity/schemas/documents/quote.ts imports
 * lib/quotes/quote-totals), so nothing here may pull in fs, Sanity, React or
 * `server-only`.
 */

export const PORTFOLIO_COLORS = [
  'black',
  'blue',
  'brown',
  'camo',
  'clear',
  'gold',
  'gray',
  'green',
  'iridescent',
  'multi-color',
  'neon',
  'orange',
  'pink',
  'purple',
  'rainbow',
  'red',
  'safety',
  'silver',
  'white',
  'yellow',
] as const;

export type PortfolioColor = (typeof PORTFOLIO_COLORS)[number];

const COLOR_SET: ReadonlySet<string> = new Set(PORTFOLIO_COLORS);

/** True when `value` is one of the twenty vocabulary values (exact, lowercase). */
export function isPortfolioColor(value: unknown): value is PortfolioColor {
  return typeof value === 'string' && COLOR_SET.has(value);
}

/**
 * Human label for a colour value: `multi-color` reads "Multi-Color", `safety`
 * reads "Safety". Used for the Studio checkbox titles and the gallery filter
 * buttons, so both spell the colour the same way.
 */
export function portfolioColorLabel(value: string): string {
  return value
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('-');
}

/** `{ title, value }` pairs in vocabulary order, the shape a Sanity `options.list` takes. */
export const PORTFOLIO_COLOR_OPTIONS: readonly { title: string; value: PortfolioColor }[] =
  PORTFOLIO_COLORS.map((value) => ({ title: portfolioColorLabel(value), value }));

/**
 * Keep only recognised colours, each once, in vocabulary order. Applied to
 * stored `colors[]` so a value that somehow bypassed the Studio checkboxes
 * (an API write, an old document after a vocabulary change) can never reach
 * a filter as an unknown key.
 */
export function normalizePortfolioColors(values: readonly unknown[] | null | undefined): PortfolioColor[] {
  if (!values || values.length === 0) return [];
  const present = new Set<string>();
  for (const v of values) if (isPortfolioColor(v)) present.add(v);
  return PORTFOLIO_COLORS.filter((c) => present.has(c));
}

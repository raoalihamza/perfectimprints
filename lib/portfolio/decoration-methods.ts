/**
 * The Portfolio Gallery decoration-method vocabulary (PORT-160).
 *
 * How Patrick's customers already talk about the work: embroidered, screen
 * printed, engraved. A job can carry more than one (an embroidered cap with
 * a screen-printed sleeve), so the item field is an array and the filter
 * group ORs within it like the colour group.
 *
 * This is the ONE place the list lives. The Studio schema
 * (sanity/schemas/documents/portfolio-item.ts) imports it for its checkbox
 * options, the filter model (lib/portfolio/page-filters.ts) for the group it
 * offers, and the import plan (lib/portfolio/import-plan.ts) for validation,
 * exactly as lib/portfolio/colors.ts is handled. The stored value is the URL
 * value: `/portfolio?decoration=embroidered,screen-printed`.
 *
 * Pure and dependency-free on purpose (the Studio bundle imports it by a
 * relative path): no fs, no Sanity, no React, no `server-only`.
 */

import { defineVocabulary } from './vocabulary';

export const PORTFOLIO_DECORATION_METHOD_VOCABULARY = defineVocabulary([
  { value: 'embroidered', title: 'Embroidered' },
  { value: 'screen-printed', title: 'Screen printed' },
  { value: 'full-color-printed', title: 'Full color printed' },
  { value: 'laser-engraved', title: 'Laser engraved' },
  { value: 'etched', title: 'Etched' },
  { value: 'die-cut', title: 'Die cut' },
]);

export const PORTFOLIO_DECORATION_METHODS = PORTFOLIO_DECORATION_METHOD_VOCABULARY.values;

export type PortfolioDecorationMethod = (typeof PORTFOLIO_DECORATION_METHODS)[number];

/** `{ title, value }` pairs in vocabulary order, the shape a Sanity `options.list` takes. */
export const PORTFOLIO_DECORATION_METHOD_OPTIONS = PORTFOLIO_DECORATION_METHOD_VOCABULARY.options;

/** True when `value` is one of the vocabulary values (exact, lowercase). */
export function isPortfolioDecorationMethod(value: unknown): value is PortfolioDecorationMethod {
  return PORTFOLIO_DECORATION_METHOD_VOCABULARY.is(value);
}

/** Human label for a value: `screen-printed` reads "Screen printed". */
export function portfolioDecorationMethodLabel(value: string): string {
  return PORTFOLIO_DECORATION_METHOD_VOCABULARY.label(value);
}

/**
 * Keep only recognised methods, each once, in vocabulary order. Applied to
 * stored `decorationMethods[]` so a value that bypassed the Studio checkboxes
 * can never reach a filter as an unknown key.
 */
export function normalizePortfolioDecorationMethods(
  values: readonly unknown[] | null | undefined,
): PortfolioDecorationMethod[] {
  return PORTFOLIO_DECORATION_METHOD_VOCABULARY.normalize(values);
}

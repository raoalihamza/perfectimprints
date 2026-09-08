/**
 * The Portfolio Gallery industry vocabulary (PORT-160).
 *
 * The question every B2B buyer asks first is "what have you made for someone
 * like me": a school wants to see work for other schools. An item belongs to
 * ONE customer type, so the item field is a single value (a dropdown in the
 * Studio) and the filter group still ORs within itself (tick two industries,
 * see the work for either).
 *
 * This is the ONE place the list lives. The Studio schema
 * (sanity/schemas/documents/portfolio-item.ts) imports it for its dropdown
 * options, the filter model (lib/portfolio/page-filters.ts) for the group it
 * offers, and the import plan (lib/portfolio/import-plan.ts) for validation,
 * exactly as lib/portfolio/colors.ts is handled. The stored value is the URL
 * value: `/portfolio?industry=fire-and-ems`.
 *
 * Pure and dependency-free on purpose (the Studio bundle imports it by a
 * relative path): no fs, no Sanity, no React, no `server-only`.
 */

import { defineVocabulary } from './vocabulary';

export const PORTFOLIO_INDUSTRY_VOCABULARY = defineVocabulary([
  { value: 'schools-and-colleges', title: 'Schools and colleges' },
  { value: 'churches', title: 'Churches' },
  { value: 'fire-and-ems', title: 'Fire and EMS' },
  { value: 'restaurants-and-hospitality', title: 'Restaurants and hospitality' },
  { value: 'sports-and-fitness', title: 'Sports and fitness' },
  { value: 'healthcare', title: 'Healthcare' },
  { value: 'charity-and-events', title: 'Charity and events' },
  { value: 'business-and-corporate', title: 'Business and corporate' },
  { value: 'trades-and-services', title: 'Trades and services' },
]);

export const PORTFOLIO_INDUSTRIES = PORTFOLIO_INDUSTRY_VOCABULARY.values;

export type PortfolioIndustry = (typeof PORTFOLIO_INDUSTRIES)[number];

/** `{ title, value }` pairs in vocabulary order, the shape a Sanity `options.list` takes. */
export const PORTFOLIO_INDUSTRY_OPTIONS = PORTFOLIO_INDUSTRY_VOCABULARY.options;

/** True when `value` is one of the vocabulary values (exact, lowercase). */
export function isPortfolioIndustry(value: unknown): value is PortfolioIndustry {
  return PORTFOLIO_INDUSTRY_VOCABULARY.is(value);
}

/** Human label for a value: `fire-and-ems` reads "Fire and EMS". */
export function portfolioIndustryLabel(value: string): string {
  return PORTFOLIO_INDUSTRY_VOCABULARY.label(value);
}

/**
 * The one recognised industry a stored value names, or null. Applied to the
 * stored `industry` so a value that bypassed the Studio dropdown can never
 * reach a filter as an unknown key.
 */
export function normalizePortfolioIndustry(value: unknown): PortfolioIndustry | null {
  return PORTFOLIO_INDUSTRY_VOCABULARY.normalizeOne(value);
}

/**
 * PORT-100: the portfolio colour vocabulary must BE the site's colour-facet
 * vocabulary, not a copy of it that can drift. The set is derived here from
 * data/pi-urls/category-urls.json the same way the figure in the module
 * comment was measured, and the constant must equal it exactly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PORTFOLIO_COLORS,
  PORTFOLIO_COLOR_OPTIONS,
  isPortfolioColor,
  normalizePortfolioColors,
  portfolioColorLabel,
} from './colors';

function colorFacetValuesFromData(): { values: string[]; urlCount: number } {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, '..', '..', 'data', 'pi-urls', 'category-urls.json'), 'utf8'),
  ) as unknown;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (Object.values(raw as Record<string, unknown>).find(Array.isArray) as unknown[]) ?? [];
  const seen = new Set<string>();
  let urlCount = 0;
  for (const entry of list) {
    const url = typeof entry === 'string' ? entry : (entry as { url?: string })?.url;
    const m = /^\/cat\/[^/]+\/color\/([^/]+)$/.exec(url ?? '');
    if (!m) continue;
    seen.add(m[1]);
    urlCount += 1;
  }
  return { values: [...seen].sort(), urlCount };
}

describe('the portfolio colours are the /cat colour-facet vocabulary', () => {
  const data = colorFacetValuesFromData();

  it('matches the distinct facet values in the URL data exactly, in sorted order', () => {
    expect([...PORTFOLIO_COLORS]).toEqual(data.values);
  });

  it('is the twenty values over the 3,193 colour URLs PORT-000 counted', () => {
    expect(data.values).toHaveLength(20);
    expect(data.urlCount).toBe(3193);
  });

  it('holds only lowercase slug-shaped values with no duplicates', () => {
    for (const c of PORTFOLIO_COLORS) expect(c).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(new Set(PORTFOLIO_COLORS).size).toBe(PORTFOLIO_COLORS.length);
  });
});

describe('helpers', () => {
  it('recognises vocabulary values and nothing else', () => {
    expect(isPortfolioColor('blue')).toBe(true);
    expect(isPortfolioColor('multi-color')).toBe(true);
    expect(isPortfolioColor('Blue')).toBe(false);
    expect(isPortfolioColor('navy')).toBe(false);
    expect(isPortfolioColor(undefined)).toBe(false);
  });

  it('labels a value the way the filter buttons and Studio checkboxes both show it', () => {
    expect(portfolioColorLabel('blue')).toBe('Blue');
    expect(portfolioColorLabel('multi-color')).toBe('Multi-Color');
    expect(PORTFOLIO_COLOR_OPTIONS.find((o) => o.value === 'safety')?.title).toBe('Safety');
    expect(PORTFOLIO_COLOR_OPTIONS).toHaveLength(20);
  });

  it('normalises stored colours to known values, once each, in vocabulary order', () => {
    expect(normalizePortfolioColors(['red', 'navy', 'black', 'red', 7, null])).toEqual(['black', 'red']);
    expect(normalizePortfolioColors(undefined)).toEqual([]);
    expect(normalizePortfolioColors([])).toEqual([]);
  });
});

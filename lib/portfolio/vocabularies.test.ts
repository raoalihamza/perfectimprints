/**
 * PORT-160: the two further portfolio vocabularies. Each lives in ONE file
 * (decoration-methods.ts, industries.ts) that the Studio schema, the filter
 * model and the import plan all import, and the stored values are pinned
 * here so the metadata file can be filled to match and a rename cannot slip
 * through unnoticed.
 */
import { describe, expect, it } from 'vitest';

import {
  PORTFOLIO_DECORATION_METHODS,
  PORTFOLIO_DECORATION_METHOD_OPTIONS,
  isPortfolioDecorationMethod,
  normalizePortfolioDecorationMethods,
  portfolioDecorationMethodLabel,
} from './decoration-methods';
import {
  PORTFOLIO_INDUSTRIES,
  PORTFOLIO_INDUSTRY_OPTIONS,
  isPortfolioIndustry,
  normalizePortfolioIndustry,
  portfolioIndustryLabel,
} from './industries';
import { VOCABULARY_VALUE_PATTERN, defineVocabulary } from './vocabulary';

describe('the stored values (what the metadata file must use)', () => {
  it('decoration methods, in filter order', () => {
    expect([...PORTFOLIO_DECORATION_METHODS]).toEqual([
      'embroidered',
      'screen-printed',
      'full-color-printed',
      'laser-engraved',
      'etched',
      'die-cut',
    ]);
  });

  it('industries, in filter order', () => {
    expect([...PORTFOLIO_INDUSTRIES]).toEqual([
      'schools-and-colleges',
      'churches',
      'fire-and-ems',
      'restaurants-and-hospitality',
      'sports-and-fitness',
      'healthcare',
      'charity-and-events',
      'business-and-corporate',
      'trades-and-services',
    ]);
  });

  it('every value is URL-safe (lowercase, digits, single dashes) and unique, like the colours', () => {
    for (const list of [PORTFOLIO_DECORATION_METHODS, PORTFOLIO_INDUSTRIES]) {
      for (const v of list) expect(v).toMatch(VOCABULARY_VALUE_PATTERN);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe('labels', () => {
  it('read as words, with the acronym kept', () => {
    expect(portfolioDecorationMethodLabel('screen-printed')).toBe('Screen printed');
    expect(portfolioDecorationMethodLabel('full-color-printed')).toBe('Full color printed');
    expect(portfolioDecorationMethodLabel('die-cut')).toBe('Die cut');
    expect(portfolioIndustryLabel('fire-and-ems')).toBe('Fire and EMS');
    expect(portfolioIndustryLabel('schools-and-colleges')).toBe('Schools and colleges');
  });

  it('an unknown value labels as itself rather than blank', () => {
    expect(portfolioDecorationMethodLabel('sublimated')).toBe('sublimated');
    expect(portfolioIndustryLabel('military')).toBe('military');
  });

  it('the Studio options carry the same values and labels in the same order', () => {
    expect(PORTFOLIO_DECORATION_METHOD_OPTIONS.map((o) => o.value)).toEqual([...PORTFOLIO_DECORATION_METHODS]);
    expect(PORTFOLIO_DECORATION_METHOD_OPTIONS.map((o) => o.title)).toEqual(
      PORTFOLIO_DECORATION_METHODS.map(portfolioDecorationMethodLabel),
    );
    expect(PORTFOLIO_INDUSTRY_OPTIONS.map((o) => o.value)).toEqual([...PORTFOLIO_INDUSTRIES]);
    expect(PORTFOLIO_INDUSTRY_OPTIONS.map((o) => o.title)).toEqual(PORTFOLIO_INDUSTRIES.map(portfolioIndustryLabel));
  });
});

describe('membership and normalisation', () => {
  it('recognises exact lowercase values only', () => {
    expect(isPortfolioDecorationMethod('embroidered')).toBe(true);
    expect(isPortfolioDecorationMethod('Embroidered')).toBe(false);
    expect(isPortfolioDecorationMethod('screen printed')).toBe(false);
    expect(isPortfolioDecorationMethod(null)).toBe(false);
    expect(isPortfolioIndustry('churches')).toBe(true);
    expect(isPortfolioIndustry('church')).toBe(false);
    expect(isPortfolioIndustry(3)).toBe(false);
  });

  it('normalises an array to known values, each once, in vocabulary order', () => {
    expect(normalizePortfolioDecorationMethods(['die-cut', 'sublimated', 'embroidered', 'die-cut'])).toEqual([
      'embroidered',
      'die-cut',
    ]);
    expect(normalizePortfolioDecorationMethods(null)).toEqual([]);
    expect(normalizePortfolioDecorationMethods(undefined)).toEqual([]);
    expect(normalizePortfolioDecorationMethods([])).toEqual([]);
  });

  it('normalises a single industry to the value or null', () => {
    expect(normalizePortfolioIndustry('healthcare')).toBe('healthcare');
    expect(normalizePortfolioIndustry('Healthcare')).toBeNull();
    expect(normalizePortfolioIndustry('')).toBeNull();
    expect(normalizePortfolioIndustry(undefined)).toBeNull();
  });
});

describe('defineVocabulary (the shared factory)', () => {
  const v = defineVocabulary([
    { value: 'a', title: 'A' },
    { value: 'b-c', title: 'B and C' },
  ]);

  it('exposes values, options, membership, labels and both normalisers', () => {
    expect([...v.values]).toEqual(['a', 'b-c']);
    expect([...v.options]).toEqual([
      { title: 'A', value: 'a' },
      { title: 'B and C', value: 'b-c' },
    ]);
    expect(v.is('a')).toBe(true);
    expect(v.is('c')).toBe(false);
    expect(v.label('b-c')).toBe('B and C');
    expect(v.normalize(['b-c', 'zz', 'a'])).toEqual(['a', 'b-c']);
    expect(v.normalizeOne('b-c')).toBe('b-c');
    expect(v.normalizeOne('zz')).toBeNull();
  });
});

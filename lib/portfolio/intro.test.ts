import { describe, expect, it } from 'vitest';
import { resolvePortfolioIntro } from './intro';

const block = (text: string) => ({
  _type: 'block',
  _key: 'k',
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 's', text, marks: [] }],
});

describe('resolvePortfolioIntro (PORT-115)', () => {
  it('returns null for nothing, a non-array and an empty array', () => {
    expect(resolvePortfolioIntro(undefined)).toBeNull();
    expect(resolvePortfolioIntro(null)).toBeNull();
    expect(resolvePortfolioIntro('We make things')).toBeNull();
    expect(resolvePortfolioIntro({})).toBeNull();
    expect(resolvePortfolioIntro([])).toBeNull();
  });

  it('returns null when every span is blank (a field opened and left empty)', () => {
    expect(resolvePortfolioIntro([block('')])).toBeNull();
    expect(resolvePortfolioIntro([block('   '), block('')])).toBeNull();
  });

  it('returns the SAME array, untouched, when there is text to show', () => {
    const value = [block('Twelve years of embroidered caps and printed tees.')];
    expect(resolvePortfolioIntro(value)).toBe(value);
  });

  it('keeps a value whose text sits in a later block', () => {
    const value = [block(''), block('Real work for real customers.')];
    expect(resolvePortfolioIntro(value)).toBe(value);
  });
});

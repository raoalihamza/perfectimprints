/**
 * MERCH-220: the shipping policy resolver, the half of the feature that turns
 * what Patrick types in Global Settings into what `shippingRateFor` computes.
 * The rate itself is tested beside its function in product-schema.test.ts;
 * this file covers the boundary between the two (a 15 typed in Studio reaches
 * the builder as 15, a 150 does not reach it at all, and blank stays blank).
 */
import { describe, expect, it } from 'vitest';

import { resolveBlogAutomation, resolveShippingPolicy } from './global-settings';

describe('resolveShippingPolicy (MERCH-220)', () => {
  it('resolves to null when nothing is set, exactly as MERCH-100 did', () => {
    expect(resolveShippingPolicy(null)).toBeNull();
    expect(resolveShippingPolicy(undefined)).toBeNull();
    expect(resolveShippingPolicy({})).toBeNull();
  });

  it("carries Patrick's percentage through as percent, untouched", () => {
    const policy = resolveShippingPolicy({ orderPercentage: 15, destinationCountry: 'US' });
    expect(policy).toEqual({
      orderPercentage: 15,
      rate: null,
      destinationCountry: 'US',
      handlingDaysMin: null,
      handlingDaysMax: null,
      transitDaysMin: null,
      transitDaysMax: null,
    });
  });

  it('keeps the flat rate beside the percentage; precedence is decided downstream, not here', () => {
    const policy = resolveShippingPolicy({ orderPercentage: 15, flatRate: 9 });
    expect(policy?.orderPercentage).toBe(15);
    expect(policy?.rate).toBe(9);
  });

  it('treats a percentage outside 0..100 as unset rather than passing a nonsense share on', () => {
    expect(resolveShippingPolicy({ orderPercentage: 150 })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: -5 })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: Number.NaN })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: 100 })?.orderPercentage).toBe(100);
    expect(resolveShippingPolicy({ orderPercentage: 0 })?.orderPercentage).toBe(0);
  });

  it('keeps the handling fallback and transit range as numbers, as before', () => {
    const policy = resolveShippingPolicy({ handlingDaysMin: 10, handlingDaysMax: 10, transitDaysMin: 3, transitDaysMax: 7 });
    expect(policy).toMatchObject({ handlingDaysMin: 10, handlingDaysMax: 10, transitDaysMin: 3, transitDaysMax: 7 });
    expect(policy?.orderPercentage).toBeNull();
  });
});

describe('resolveBlogAutomation (AUTO-110)', () => {
  it('resolves a missing object to an empty list, the state of the singleton before the ticket', () => {
    expect(resolveBlogAutomation(undefined)).toEqual({ negativeKeywords: [] });
    expect(resolveBlogAutomation(null)).toEqual({ negativeKeywords: [] });
    expect(resolveBlogAutomation({})).toEqual({ negativeKeywords: [] });
    expect(resolveBlogAutomation({ negativeKeywords: [] })).toEqual({ negativeKeywords: [] });
  });

  it('keeps what the panel wrote, trimmed, with its date and note', () => {
    expect(
      resolveBlogAutomation({
        negativeKeywords: [{ term: '  fun facts about paramedics ', addedAt: '2026-09-24T10:00:00.000Z', note: ' not our buyers ' }],
      }),
    ).toEqual({
      negativeKeywords: [{ term: 'fun facts about paramedics', addedAt: '2026-09-24T10:00:00.000Z', note: 'not our buyers' }],
    });
  });

  it('drops blank terms and case-insensitive duplicates, first entry winning', () => {
    const resolved = resolveBlogAutomation({
      negativeKeywords: [
        { term: '' },
        { term: '   ' },
        { term: 'Paramedics', note: 'first' },
        { term: 'paramedics', note: 'second' },
        {},
        { term: 'nurses' },
      ],
    });
    expect(resolved.negativeKeywords.map((k) => k.term)).toEqual(['Paramedics', 'nurses']);
    expect(resolved.negativeKeywords[0].note).toBe('first');
    expect(resolved.negativeKeywords[1]).toEqual({ term: 'nurses', addedAt: null, note: null });
  });
});

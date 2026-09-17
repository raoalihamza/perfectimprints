/**
 * MERCH-220: the shipping policy resolver, the half of the feature that turns
 * what Patrick types in Global Settings into what `shippingRateFor` computes.
 * The rate itself is tested beside its function in product-schema.test.ts;
 * this file covers the boundary between the two (a 15 typed in Studio reaches
 * the builder as 15, a 150 does not reach it at all, and blank stays blank).
 */
import { describe, expect, it } from 'vitest';

import { resolveShippingPolicy } from './global-settings';

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

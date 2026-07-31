/**
 * Quote totals tests (Q-110). This module prices every surface of the Quick
 * Quote module (Studio preview, the future customer page / PDF / emails), so
 * the draft-tolerance and rounding rules are pinned here.
 */

import { describe, expect, it } from 'vitest';
import {
  computeQuoteTotals,
  quoteLineTotal,
  roundCents,
  type QuoteChargeLineInput,
  type QuoteProductLineInput,
} from './quote-totals';

const geigerLine = (over: Partial<QuoteProductLineInput> = {}): QuoteProductLineInput => ({
  _type: 'quoteGeigerLine',
  quantity: 100,
  unitCost: 5,
  setupCharge: 50,
  shipping: 25,
  ...over,
});

const chargeLine = (over: Partial<QuoteChargeLineInput> = {}): QuoteChargeLineInput => ({
  _type: 'quoteChargeLine',
  quantity: 1,
  unitPrice: 40,
  ...over,
});

describe('computeQuoteTotals - empty quote', () => {
  it('returns all zeros for no line items', () => {
    const t = computeQuoteTotals(undefined);
    expect(t.lineTotals).toEqual([]);
    expect(t.subtotal).toBe(0);
    expect(t.shippingTotal).toBe(0);
    expect(t.salesTax).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('tolerates a non-array lineItems value and junk entries without throwing', () => {
    expect(computeQuoteTotals('junk').grandTotal).toBe(0);
    const t = computeQuoteTotals([null, 42, 'x', { _type: 'unknownLine', quantity: 5 }]);
    expect(t.lineTotals).toEqual([0, 0, 0, 0]);
    expect(t.grandTotal).toBe(0);
  });
});

describe('quoteLineTotal - single lines', () => {
  it('product line = quantity x unit cost + setup + shipping', () => {
    expect(quoteLineTotal(geigerLine())).toBeCloseTo(100 * 5 + 50 + 25, 2);
  });

  it('the three product line types share the same formula', () => {
    const base = { quantity: 10, unitCost: 2.5, setupCharge: 10, shipping: 5 };
    // 10 x 2.50 + 10 setup + 5 shipping = 40
    expect(quoteLineTotal({ _type: 'quoteGeigerLine', ...base })).toBe(40);
    expect(quoteLineTotal({ _type: 'quoteOwnProductLine', ...base })).toBe(40);
    expect(quoteLineTotal({ _type: 'quoteCustomLine', ...base })).toBe(40);
  });

  it('charge line = quantity x unit price (no setup, no shipping fields)', () => {
    expect(quoteLineTotal(chargeLine({ quantity: 2, unitPrice: 40 }))).toBe(80);
  });

  it('missing, negative, and non-finite inputs are treated as zero', () => {
    expect(quoteLineTotal(geigerLine({ quantity: undefined }))).toBe(50 + 25);
    expect(quoteLineTotal(geigerLine({ unitCost: -5 }))).toBe(50 + 25);
    expect(quoteLineTotal(geigerLine({ setupCharge: Number.NaN, shipping: null }))).toBe(500);
    expect(
      quoteLineTotal(geigerLine({ quantity: Number.POSITIVE_INFINITY, unitCost: 5 })),
    ).toBe(50 + 25);
    expect(quoteLineTotal(chargeLine({ unitPrice: undefined }))).toBe(0);
  });

  it('a setup charge of exactly 0 is kept as 0 (same semantics as the estimate module)', () => {
    expect(quoteLineTotal(geigerLine({ setupCharge: 0 }))).toBe(500 + 25);
  });
});

describe('computeQuoteTotals - mixed quotes', () => {
  it('splits subtotal (merchandise) from the shipping total; grand adds tax', () => {
    const t = computeQuoteTotals(
      [
        geigerLine(), // 100 x 5 + 50 setup = 550 merchandise, 25 shipping
        { _type: 'quoteCustomLine', quantity: 10, unitCost: 12, shipping: 15 }, // 120 + 15
        chargeLine({ quantity: 1, unitPrice: 40 }), // 40 merchandise
      ],
      18.5,
    );
    expect(t.subtotal).toBeCloseTo(550 + 120 + 40, 2);
    expect(t.shippingTotal).toBeCloseTo(25 + 15, 2);
    expect(t.salesTax).toBe(18.5);
    expect(t.grandTotal).toBeCloseTo(710 + 40 + 18.5, 2);
  });

  it('subtotal + shippingTotal equals the sum of the line totals', () => {
    const lines = [geigerLine(), chargeLine(), geigerLine({ shipping: 9.99, setupCharge: 0 })];
    const t = computeQuoteTotals(lines, 0);
    const linesSum = t.lineTotals.reduce((a, b) => a + b, 0);
    expect(roundCents(t.subtotal + t.shippingTotal)).toBeCloseTo(roundCents(linesSum), 2);
  });

  it('tax omitted, null, negative, or non-finite adds nothing', () => {
    const lines = [chargeLine({ quantity: 1, unitPrice: 100 })];
    expect(computeQuoteTotals(lines).grandTotal).toBe(100);
    expect(computeQuoteTotals(lines, null).grandTotal).toBe(100);
    expect(computeQuoteTotals(lines, -3).grandTotal).toBe(100);
    expect(computeQuoteTotals(lines, Number.NaN).grandTotal).toBe(100);
  });

  it('tax included adds exactly the entered amount (never computed)', () => {
    const t = computeQuoteTotals([chargeLine({ quantity: 1, unitPrice: 100 })], 7.77);
    expect(t.salesTax).toBe(7.77);
    expect(t.grandTotal).toBe(107.77);
  });
});

describe('rounding - fraction-of-a-cent totals', () => {
  it('a line landing on a fraction of a cent rounds half-up to whole cents', () => {
    // 3 x $0.335 = $1.005 exactly -> rounds to $1.01 (not $1.00).
    expect(quoteLineTotal(chargeLine({ quantity: 3, unitPrice: 0.335 }))).toBe(1.01);
  });

  it('float noise does not leak into totals (0.1 + 0.2 class)', () => {
    const t = computeQuoteTotals([
      { _type: 'quoteGeigerLine', quantity: 1, unitCost: 0.1, shipping: 0 },
      { _type: 'quoteGeigerLine', quantity: 1, unitCost: 0.2, shipping: 0 },
    ]);
    expect(t.subtotal).toBe(0.3);
    expect(t.grandTotal).toBe(0.3);
  });

  it('roundCents guards non-finite input', () => {
    expect(roundCents(Number.NaN)).toBe(0);
    expect(roundCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundCents(1.005)).toBe(1.01);
  });
});

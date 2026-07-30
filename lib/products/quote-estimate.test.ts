/**
 * Quote-estimate math tests (Q-100). First test coverage for this module -
 * added alongside the per-decoration setup charge change, since this formula
 * prices every /products/<slug> estimate and the future quote line items.
 */

import { describe, expect, it } from 'vitest';
import {
  decorationLabel,
  decorationUpchargeFor,
  effectiveSetupCharge,
  estimateForQuantity,
  formatUsd,
  minimumQuantity,
  type DecorationOption,
  type QuoteTier,
} from './quote-estimate';

const TIERS: QuoteTier[] = [
  { minQty: 50, price: 8.99 },
  { minQty: 100, price: 7.99 },
  { minQty: 250, price: 6.99 },
];

const DECORATIONS: DecorationOption[] = [
  { method: 'Screen Print', upcharge: 0, setupCharge: 45 },
  { method: 'Laser Engraving', upcharge: 0, setupCharge: 0 },
  { method: 'Pad Print', upcharge: 0.5 },
  { method: 'Embroidery', upcharge: 0 },
];

describe('minimumQuantity', () => {
  it('returns the first (sorted) tier minQty', () => {
    expect(minimumQuantity(TIERS)).toBe(50);
  });

  it('returns 1 when there are no tiers', () => {
    expect(minimumQuantity([])).toBe(1);
  });
});

describe('estimateForQuantity - tier selection', () => {
  it('picks the tier with the greatest minQty at or below the quantity (between tiers)', () => {
    const est = estimateForQuantity(TIERS, 150);
    expect(est?.tierIndex).toBe(1);
    expect(est?.unitPrice).toBe(7.99);
  });

  it('picks the exact tier on a boundary quantity', () => {
    const est = estimateForQuantity(TIERS, 100);
    expect(est?.tierIndex).toBe(1);
    expect(est?.unitPrice).toBe(7.99);
  });

  it('uses the top tier above the highest boundary', () => {
    const est = estimateForQuantity(TIERS, 10000);
    expect(est?.tierIndex).toBe(2);
    expect(est?.unitPrice).toBe(6.99);
  });

  it('clamps a below-floor quantity UP to the minimum', () => {
    const est = estimateForQuantity(TIERS, 10);
    expect(est?.quantity).toBe(50);
    expect(est?.tierIndex).toBe(0);
    expect(est?.total).toBeCloseTo(50 * 8.99, 2);
  });

  it('returns null when there are no tiers', () => {
    expect(estimateForQuantity([], 100)).toBeNull();
  });
});

describe('decorationUpchargeFor', () => {
  it('returns the selected method upcharge', () => {
    expect(decorationUpchargeFor(DECORATIONS, 'Pad Print')).toBe(0.5);
  });

  it('returns 0 for an unknown method name', () => {
    expect(decorationUpchargeFor(DECORATIONS, 'Debossing')).toBe(0);
  });

  it('returns 0 for a blank / null method', () => {
    expect(decorationUpchargeFor(DECORATIONS, '')).toBe(0);
    expect(decorationUpchargeFor(DECORATIONS, null)).toBe(0);
    expect(decorationUpchargeFor(DECORATIONS, undefined)).toBe(0);
  });

  it('treats a zero upcharge as no upcharge', () => {
    expect(decorationUpchargeFor(DECORATIONS, 'Embroidery')).toBe(0);
  });
});

describe('effectiveSetupCharge - the Q-100 precedence rule', () => {
  it('falls back to the flat charge when the method has no setup of its own', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print', 30)).toBe(30);
  });

  it('an explicit 0 on the method OVERRIDES the flat charge (0 is not blank)', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Laser Engraving', 30)).toBe(0);
  });

  it('a positive per-method value overrides the flat charge', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Screen Print', 30)).toBe(45);
  });

  it('ignores a negative or non-finite per-method value and uses the flat charge', () => {
    const bad: DecorationOption[] = [
      { method: 'Neg', upcharge: 0, setupCharge: -5 },
      { method: 'Nan', upcharge: 0, setupCharge: Number.NaN },
      { method: 'Inf', upcharge: 0, setupCharge: Number.POSITIVE_INFINITY },
    ];
    expect(effectiveSetupCharge(bad, 'Neg', 30)).toBe(30);
    expect(effectiveSetupCharge(bad, 'Nan', 30)).toBe(30);
    expect(effectiveSetupCharge(bad, 'Inf', 30)).toBe(30);
  });

  it('ignores a negative or non-finite flat charge', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print', -30)).toBe(0);
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print', Number.NaN)).toBe(0);
  });

  it('returns 0 with no flat and no per-method value', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print')).toBe(0);
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print', null)).toBe(0);
    expect(effectiveSetupCharge([], null, undefined)).toBe(0);
  });

  it('an unknown or unselected method uses the flat charge', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Debossing', 30)).toBe(30);
    expect(effectiveSetupCharge(DECORATIONS, null, 30)).toBe(30);
    expect(effectiveSetupCharge(DECORATIONS, undefined, 30)).toBe(30);
  });

  it('a flat charge of exactly 0 resolves to 0 (same result as unset)', () => {
    expect(effectiveSetupCharge(DECORATIONS, 'Pad Print', 0)).toBe(0);
  });
});

describe('estimateForQuantity - total formula with upcharge and resolved setup', () => {
  it('total = qty x (unitPrice + upcharge) + setup', () => {
    const upcharge = decorationUpchargeFor(DECORATIONS, 'Pad Print');
    const setup = effectiveSetupCharge(DECORATIONS, 'Pad Print', 30);
    const est = estimateForQuantity(TIERS, 100, setup, upcharge);
    expect(est?.total).toBeCloseTo(100 * (7.99 + 0.5) + 30, 2);
    expect(est?.setupCharge).toBe(30);
    expect(est?.decorationUpcharge).toBe(0.5);
  });

  it('a resolved per-method 0 yields no setup in the total', () => {
    const setup = effectiveSetupCharge(DECORATIONS, 'Laser Engraving', 30);
    const est = estimateForQuantity(TIERS, 100, setup, 0);
    expect(est?.total).toBeCloseTo(100 * 7.99, 2);
    expect(est?.setupCharge).toBe(0);
  });

  it('a resolved per-method override replaces the flat fee in the total', () => {
    const setup = effectiveSetupCharge(DECORATIONS, 'Screen Print', 30);
    const est = estimateForQuantity(TIERS, 250, setup, 0);
    expect(est?.total).toBeCloseTo(250 * 6.99 + 45, 2);
    expect(est?.setupCharge).toBe(45);
  });

  it('back-compat: no per-method setups anywhere reduces to the original formula', () => {
    const legacy: DecorationOption[] = [{ method: 'Pad Print', upcharge: 0.5 }];
    const setup = effectiveSetupCharge(legacy, 'Pad Print', 45);
    const est = estimateForQuantity(TIERS, 150, setup, 0.5);
    expect(est?.total).toBeCloseTo(150 * (7.99 + 0.5) + 45, 2);
  });
});

describe('decorationLabel', () => {
  it('appends the per-unit upcharge when there is one (byte-identical to the old inline helper)', () => {
    expect(decorationLabel({ method: 'Pad Print', upcharge: 0.5 })).toBe(
      'Pad Print (+$0.50/unit)',
    );
  });

  it('is just the method name with no upcharge', () => {
    expect(decorationLabel({ method: 'Laser Engraving', upcharge: 0 })).toBe('Laser Engraving');
  });

  it('does not mention the setup charge (label unchanged by Q-100)', () => {
    expect(decorationLabel({ method: 'Screen Print', upcharge: 0, setupCharge: 45 })).toBe(
      'Screen Print',
    );
  });
});

describe('formatUsd', () => {
  it('formats with the pinned en-US locale', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0)).toBe('$0.00');
  });
});

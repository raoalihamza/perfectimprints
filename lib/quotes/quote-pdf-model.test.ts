import { describe, expect, it } from 'vitest';

import {
  QUOTE_PDF_DESCRIPTION_MAX_CHARS,
  buildQuotePdfModel,
  clampQuoteText,
  normalizeQuoteImageUrl,
  quotePdfFileName,
  quotePdfLineImage,
} from './quote-pdf-model';

/**
 * Q-160. Every expected value here is written as a literal worked out by hand;
 * nothing imports the module under test to check itself.
 */

const NOW = new Date('2026-08-02T12:00:00Z');

describe('normalizeQuoteImageUrl', () => {
  it('strips format=webp, which the PDF renderer cannot decode', () => {
    const out = normalizeQuoteImageUrl(
      'https://imgsirv.geiger.com/x.jpg?format=webp&w=275&h=275',
    );
    expect(out).not.toContain('format=webp');
    expect(out).toContain('w=275');
    expect(out).toContain('h=275');
  });

  it('strips any other undecodable format, not just webp', () => {
    expect(normalizeQuoteImageUrl('https://x.test/a?format=avif')).not.toContain('format');
  });

  it('keeps a format the renderer CAN decode', () => {
    expect(normalizeQuoteImageUrl('https://x.test/a?format=jpg')).toContain('format=jpg');
    expect(normalizeQuoteImageUrl('https://x.test/a?format=PNG')).toContain('format=PNG');
  });

  it('rejects anything that is not http(s)', () => {
    expect(normalizeQuoteImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(normalizeQuoteImageUrl('/local/path.jpg')).toBeNull();
    expect(normalizeQuoteImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects blanks and non-strings without throwing', () => {
    expect(normalizeQuoteImageUrl('')).toBeNull();
    expect(normalizeQuoteImageUrl('   ')).toBeNull();
    expect(normalizeQuoteImageUrl(null)).toBeNull();
    expect(normalizeQuoteImageUrl(undefined)).toBeNull();
    expect(normalizeQuoteImageUrl(42)).toBeNull();
    expect(normalizeQuoteImageUrl('not a url at all')).toBeNull();
  });
});

describe('clampQuoteText', () => {
  it('leaves short text alone', () => {
    expect(clampQuoteText('A short note', 100)).toBe('A short note');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const out = clampQuoteText('alpha beta gamma delta epsilon', 14);
    expect(out).toBe('alpha beta...');
  });

  it('never returns more than the cap plus the ellipsis', () => {
    const long = 'word '.repeat(400);
    const out = clampQuoteText(long, QUOTE_PDF_DESCRIPTION_MAX_CHARS) ?? '';
    expect(out.length).toBeLessThanOrEqual(QUOTE_PDF_DESCRIPTION_MAX_CHARS + 3);
    expect(out.endsWith('...')).toBe(true);
  });

  it('collapses runs of spaces', () => {
    expect(clampQuoteText('a     b', 100)).toBe('a b');
  });

  it('treats blanks and junk as absent', () => {
    expect(clampQuoteText('   ', 100)).toBeNull();
    expect(clampQuoteText(null, 100)).toBeNull();
    expect(clampQuoteText({ a: 1 }, 100)).toBeNull();
  });
});

describe('quotePdfLineImage', () => {
  it('prefers the snapshot URL stored on the quote', () => {
    const url = quotePdfLineImage(
      {
        _type: 'quoteOwnProductLine',
        imageUrl: 'https://cdn.test/snapshot.jpg',
        product: { image: { asset: { _ref: 'image-abc' } } },
      },
      () => 'https://cdn.test/live.jpg',
    );
    expect(url).toBe('https://cdn.test/snapshot.jpg');
  });

  it('falls back to the referenced product image when there is no snapshot', () => {
    const url = quotePdfLineImage(
      { _type: 'quoteOwnProductLine', product: { image: { asset: { _ref: 'image-abc' } } } },
      () => 'https://cdn.test/live.jpg',
    );
    expect(url).toBe('https://cdn.test/live.jpg');
  });

  it('uses a custom line\'s own uploaded image', () => {
    const url = quotePdfLineImage(
      { _type: 'quoteCustomLine', image: { asset: { _ref: 'image-abc' } } },
      () => 'https://cdn.test/custom.jpg',
    );
    expect(url).toBe('https://cdn.test/custom.jpg');
  });

  it('never gives a charge line a picture', () => {
    expect(
      quotePdfLineImage(
        { _type: 'quoteChargeLine', imageUrl: 'https://cdn.test/x.jpg' },
        () => 'https://cdn.test/y.jpg',
      ),
    ).toBeNull();
  });

  it('returns null rather than throwing when the resolver gives nothing', () => {
    expect(quotePdfLineImage({ _type: 'quoteCustomLine', image: {} }, () => null)).toBeNull();
    expect(quotePdfLineImage({ _type: 'quoteCustomLine', image: {} })).toBeNull();
  });
});

describe('quotePdfFileName', () => {
  it('carries the quote number', () => {
    expect(quotePdfFileName('Q-1007')).toBe('Quote-Q-1007-Perfect-Imprints.pdf');
  });

  it('sanitizes anything that could break a Content-Disposition header', () => {
    expect(quotePdfFileName('Q "1007"/bad\nvalue')).toBe('Quote-Q-1007-bad-value-Perfect-Imprints.pdf');
  });

  it('still names the file when there is no quote number', () => {
    expect(quotePdfFileName(null)).toBe('Quote-Perfect-Imprints.pdf');
    expect(quotePdfFileName('   ')).toBe('Quote-Perfect-Imprints.pdf');
    expect(quotePdfFileName('***')).toBe('Quote-Perfect-Imprints.pdf');
  });
});

describe('buildQuotePdfModel', () => {
  const quote = {
    quoteNumber: 'Q-1007',
    quoteDate: '2026-07-20',
    expiryDate: '2026-08-19',
    customer: { company: 'Acme Corp', name: 'Dana Buyer' },
    rep: { name: 'Patrick Black', email: 'patrick@perfectimprints.com', phone: '800-773-9472' },
    salesTax: 12.5,
    lineItems: [
      {
        _key: 'a',
        _type: 'quoteCustomLine',
        displayName: 'Stainless Bottles',
        quantity: 250,
        unitCost: 4.2,
        setupCharge: 45,
        shipping: 60,
      },
      {
        _key: 'b',
        _type: 'quoteChargeLine',
        label: 'Art fee',
        quantity: 1,
        unitPrice: 35,
      },
    ],
  };

  // Hand arithmetic:
  //   line a: 250 x 4.20 = 1,050.00 ; + 45 setup + 60 shipping = 1,155.00
  //   line b: 1 x 35.00 = 35.00
  //   subtotal (shipping excluded) = 1,050 + 45 + 35 = 1,130.00
  //   shippingTotal = 60.00 ; salesTax = 12.50
  //   grandTotal = 1,130 + 60 + 12.50 = 1,202.50
  it('computes the totals the same way the page does', () => {
    const model = buildQuotePdfModel(quote, NOW);
    expect(model.lines[0].total).toBe(1155);
    expect(model.lines[1].total).toBe(35);
    expect(model.subtotal).toBe(1130);
    expect(model.shippingTotal).toBe(60);
    expect(model.salesTax).toBe(12.5);
    expect(model.grandTotal).toBe(1202.5);
  });

  it('formats the dates as the stored calendar day, with no timezone drift', () => {
    const model = buildQuotePdfModel(quote, NOW);
    expect(model.quoteDate).toBe('July 20, 2026');
    expect(model.expiryDate).toBe('August 19, 2026');
    expect(model.expired).toBe(false);
  });

  it('marks a quote expired only after its expiry day has passed', () => {
    expect(buildQuotePdfModel(quote, new Date('2026-08-19T23:00:00Z')).expired).toBe(false);
    expect(buildQuotePdfModel(quote, new Date('2026-08-20T00:30:00Z')).expired).toBe(true);
  });

  it('gives a charge line no setup and no shipping', () => {
    const model = buildQuotePdfModel(quote, NOW);
    expect(model.lines[1].isCharge).toBe(true);
    expect(model.lines[1].setup).toBeNull();
    expect(model.lines[1].shipping).toBeNull();
    expect(model.lines[1].unitLabel).toBe('Price each');
  });

  it('drops a money column no line uses', () => {
    const noExtras = buildQuotePdfModel(
      {
        lineItems: [
          { _type: 'quoteCustomLine', displayName: 'Pens', quantity: 100, unitCost: 1 },
        ],
      },
      NOW,
    );
    expect(noExtras.showSetupColumn).toBe(false);
    expect(noExtras.showShippingColumn).toBe(false);

    const withSetup = buildQuotePdfModel(quote, NOW);
    expect(withSetup.showSetupColumn).toBe(true);
    expect(withSetup.showShippingColumn).toBe(true);
  });

  it('models nothing internal: no sku, no title, no customer contact details', () => {
    const model = buildQuotePdfModel(
      {
        ...quote,
        lineItems: [
          {
            _key: 'g',
            _type: 'quoteGeigerLine',
            sku: '501003',
            displayName: 'Vinyl Football',
            quantity: 10,
            unitCost: 2,
          },
        ],
      },
      NOW,
    );
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('501003');
    expect(Object.keys(model)).not.toContain('title');
    expect(Object.keys(model)).not.toContain('sentAt');
    expect(serialized).not.toContain('customerEmail');
  });

  it('survives a half-filled draft without throwing or emitting undefined', () => {
    const model = buildQuotePdfModel(
      { lineItems: [{ _type: 'quoteCustomLine' }, null, 'junk', { _type: 'nonsense' }] } as never,
      NOW,
    );
    expect(model.lines).toHaveLength(4);
    expect(JSON.stringify(model)).not.toContain('undefined');
    expect(model.grandTotal).toBe(0);
    expect(model.lines[0].title).toBe('Item');
  });

  it('handles a quote with no line items at all', () => {
    const model = buildQuotePdfModel({}, NOW);
    expect(model.lines).toEqual([]);
    expect(model.grandTotal).toBe(0);
    expect(model.quoteNumber).toBeNull();
    expect(model.expired).toBe(false);
  });

  it('keeps a very long product name intact (the layout, not the data, wraps it)', () => {
    const longName = 'Deluxe '.repeat(20) + 'Bottle';
    const model = buildQuotePdfModel(
      { lineItems: [{ _type: 'quoteCustomLine', displayName: longName, quantity: 1, unitCost: 1 }] },
      NOW,
    );
    expect(model.lines[0].title).toBe(longName);
  });
});

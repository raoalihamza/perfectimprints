/**
 * Bulk Product Page import — parser tests (P2-CP-003). Feeds CSV byte buffers
 * through the same SheetJS path the route uses (SheetJS treats a CSV buffer
 * like a one-sheet workbook, so this also exercises the .xlsx code path).
 */

import { describe, expect, it } from 'vitest';
import { buildProductPageSetFields, collectRowImageUrls } from './build-doc';
import { parseProductSheet, parseNumberCell, parseYesNo, normalizeCategorySlug } from './parse';

function csvBytes(csv: string): Uint8Array {
  return new TextEncoder().encode(csv);
}

const FULL_HEADER =
  'Title,Slug,Brand,Item SKU,Description,Min Qty,Setup Charge,On Sale,Sale Percent Off,' +
  'Production Time,Show In New Products,Lead Recipient,Related Category,Add To Categories,' +
  'Related Keywords,Material,Features,Types,Made In USA,Eco Friendly,Closeout,' +
  'Size 1,Size 2,Tier 1 Qty,Tier 1 Price,Tier 2 Qty,Tier 2 Price,' +
  'Decoration 1,Decoration 1 Upcharge,Image 1,Image 2,' +
  'Color 1 Name,Color 1 Swatch,Color 1 Images,Color 2 Name,Color 2 Swatch,Color 2 Images';

describe('parseProductSheet', () => {
  it('parses a full row with single + numbered/multi-value columns', () => {
    const csv =
      `${FULL_HEADER}\n` +
      'Travel Tumbler,travel-tumbler,Summit,529664,"Line one.\n\nLine two.",50,$45,no,,7,yes,' +
      'patrick@perfectimprints.com,/cat/water-bottles/,"water-bottles, travel-mugs",' +
      '"custom tumblers,branded drinkware",Stainless Steel,"With A Lid,Insulated",Tumblers,no,yes,no,' +
      '20 oz,30 oz,50,8.99,100,$7.99,' +
      'Laser Engraving,0.50,https://example.com/a.jpg,https://example.com/b.jpg,' +
      'Navy,#1E3A8A,"https://example.com/n1.jpg, https://example.com/n2.jpg",Silver,C0C0C0,https://example.com/s1.jpg';

    const result = parseProductSheet(csvBytes(csv));
    expect(result.ok).toBe(true);
    expect(result.unknownColumns).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.rowNumber).toBe(2);
    expect(row.errors).toEqual([]);
    expect(row.title).toBe('Travel Tumbler');
    expect(row.slug).toBe('travel-tumbler');

    const f = row.fields;
    expect(f.brand).toBe('Summit');
    expect(f.sku).toBe('529664');
    expect(f.descriptionText).toContain('Line one.');
    expect(f.minQty).toBe(50);
    expect(f.setupCharge).toBe(45);
    expect(f.onSale).toBe(false);
    expect(f.salePercentOff).toBeUndefined();
    expect(f.productionTime).toBe(7);
    expect(f.showInNewProducts).toBe(true);
    expect(f.leadRecipient).toBe('patrick@perfectimprints.com');
    expect(f.relatedCategorySlug).toBe('water-bottles');
    expect(f.addToCategories).toEqual(['water-bottles', 'travel-mugs']);
    expect(f.relatedKeywords).toEqual(['custom tumblers', 'branded drinkware']);
    expect(f.material).toBe('Stainless Steel');
    expect(f.features).toEqual(['With A Lid', 'Insulated']);
    expect(f.types).toEqual(['Tumblers']);
    expect(f.madeInUsa).toBe(false);
    expect(f.ecoFriendly).toBe(true);
    expect(f.closeout).toBe(false);
    expect(f.sizes).toEqual(['20 oz', '30 oz']);
    expect(f.pricingTiers).toEqual([
      { minQty: 50, price: 8.99 },
      { minQty: 100, price: 7.99 },
    ]);
    expect(f.decorationMethods).toEqual([{ method: 'Laser Engraving', upcharge: 0.5 }]);
    expect(f.defaultImageUrls).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
    expect(f.colorVariants).toEqual([
      {
        colorName: 'Navy',
        swatchHex: '#1E3A8A',
        imageUrls: ['https://example.com/n1.jpg', 'https://example.com/n2.jpg'],
      },
      { colorName: 'Silver', swatchHex: '#C0C0C0', imageUrls: ['https://example.com/s1.jpg'] },
    ]);
  });

  it('requires Title, derives the slug from Title, and leaves blank cells unset', () => {
    const csv = 'Title,Brand,Min Qty\nCustom Koozie Fans!!,,\n,SomeBrand,25\n';
    const result = parseProductSheet(csvBytes(csv));
    expect(result.ok).toBe(true);

    const [good, bad] = result.rows;
    expect(good.errors).toEqual([]);
    expect(good.slug).toBe('custom-koozie-fans');
    expect(good.fields.brand).toBeUndefined();
    expect(good.fields.minQty).toBeUndefined();

    expect(bad.rowNumber).toBe(3);
    expect(bad.errors.join(' ')).toMatch(/Title is required/);
  });

  it('reports unknown columns instead of silently dropping them', () => {
    const csv = 'Title,Pricee,Colour 1 Name\nWidget,5,Red\n';
    const result = parseProductSheet(csvBytes(csv));
    expect(result.ok).toBe(true);
    expect(result.unknownColumns).toEqual(['Pricee', 'Colour 1 Name']);
  });

  it('skips incomplete tiers and flags orphan decoration upcharges as warnings', () => {
    const csv =
      'Title,Tier 1 Qty,Tier 1 Price,Tier 2 Qty,Tier 2 Price,Decoration 1,Decoration 1 Upcharge,Decoration 2 Upcharge\n' +
      'Widget,100,4.99,250,,,,1.25\n';
    const result = parseProductSheet(csvBytes(csv));
    const row = result.rows[0];
    expect(row.errors).toEqual([]);
    expect(row.fields.pricingTiers).toEqual([{ minQty: 100, price: 4.99 }]);
    expect(row.fields.decorationMethods).toBeUndefined();
    expect(row.warnings.join(' ')).toMatch(/Tier 2 needs both/);
    expect(row.warnings.join(' ')).toMatch(/Decoration 2 Upcharge has no Decoration 2 name/);
  });

  it('parses Decoration N Setup columns, keeping an explicit 0 (Q-100)', () => {
    const csv =
      'Title,Setup Charge,Decoration 1,Decoration 1 Upcharge,Decoration 1 Setup,' +
      'Decoration 2,Decoration 2 Setup,Decoration 3,Decoration 3 Setup\n' +
      'Widget,45,Screen Print,0.50,90,Laser Engraving,0,Pad Print,\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];
    expect(row.errors).toEqual([]);
    expect(row.fields.setupCharge).toBe(45);
    expect(row.fields.decorationMethods).toEqual([
      { method: 'Screen Print', upcharge: 0.5, setupCharge: 90 },
      // 0 is a real value ("no setup fee") and must NOT be dropped as blank.
      { method: 'Laser Engraving', setupCharge: 0 },
      // Blank stays omitted so the flat Setup Charge keeps applying.
      { method: 'Pad Print' },
    ]);
    expect(row.warnings).toEqual([]);
  });

  it('warns on an orphan Decoration N Setup and on an unreadable/negative setup value', () => {
    const csv =
      'Title,Decoration 1,Decoration 1 Setup,Decoration 2 Setup,Decoration 3,Decoration 3 Setup\n' +
      'Widget,Screen Print,ninety,,Embroidery,-10\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];
    expect(row.errors).toEqual([]);
    // Unreadable value: the decoration still imports, just without a setup.
    expect(row.fields.decorationMethods).toEqual([
      { method: 'Screen Print' },
      { method: 'Embroidery' },
    ]);
    expect(row.warnings.join(' ')).toMatch(/Decoration 1 Setup "ninety" is not a valid amount/);
    expect(row.warnings.join(' ')).toMatch(/Decoration 3 Setup "-10" is not a valid amount/);
    // Blank orphan cell is not flagged; a FILLED orphan cell is:
    const orphanCsv = 'Title,Decoration 2 Setup\nWidget,25\n';
    const orphanRow = parseProductSheet(csvBytes(orphanCsv)).rows[0];
    expect(orphanRow.fields.decorationMethods).toBeUndefined();
    expect(orphanRow.warnings.join(' ')).toMatch(/Decoration 2 Setup has no Decoration 2 name/);
  });

  it('flags bad image URLs and bad yes/no values as warnings, not errors', () => {
    const csv = 'Title,Image 1,On Sale\nWidget,not-a-url,maybe\n';
    const result = parseProductSheet(csvBytes(csv));
    const row = result.rows[0];
    expect(row.errors).toEqual([]);
    expect(row.fields.defaultImageUrls).toBeUndefined();
    expect(row.fields.onSale).toBeUndefined();
    expect(row.warnings.join(' ')).toMatch(/not a valid http\(s\) image URL/);
    expect(row.warnings.join(' ')).toMatch(/On Sale should be "yes" or "no"/);
  });

  it('reads "7 working days" as 7 and treats unreadable numbers as warnings, not errors', () => {
    const csv =
      'Title,Production Time,Min Qty,Setup Charge\n' +
      'Widget,7 working days,PI-TOTE-4022,yes\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];
    expect(row.errors).toEqual([]);
    expect(row.fields.productionTime).toBe(7);
    expect(row.fields.minQty).toBeUndefined();
    expect(row.fields.setupCharge).toBeUndefined();
    expect(row.warnings.join(' ')).toMatch(/Production Time "7 working days" — read as 7 days/);
    expect(row.warnings.join(' ')).toMatch(/Min Qty is not a number \("PI-TOTE-4022"\) — left unset/);
    expect(row.warnings.join(' ')).toMatch(/Setup Charge is not a number \("yes"\) — left unset/);
  });

  it('flags a row with more filled cells than headings (unquoted comma) with one clear error', () => {
    const csv =
      'Title,Description,Brand\n' +
      'Widget,Reusable, ideal for events, and promos,Acme\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];
    expect(row.errors.join(' ')).toMatch(/not wrapped in double quotes/);
  });

  it('errors the later of two rows sharing a slug', () => {
    const csv = 'Title\nCustom Pens\nCustom Pens\n';
    const result = parseProductSheet(csvBytes(csv));
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[1].errors.join(' ')).toMatch(/Same web address .* as row 2/);
  });

  it('handles a UTF-8 BOM on the first header and skips blank rows without losing row numbers', () => {
    const csv = '﻿Title,Brand\nWidget,Acme\n,\nGadget,Zenith\n';
    const result = parseProductSheet(csvBytes(csv));
    expect(result.ok).toBe(true);
    expect(result.rows.map((r) => [r.rowNumber, r.title])).toEqual([
      [2, 'Widget'],
      [4, 'Gadget'],
    ]);
  });

  it('rejects a file with no Title column and a file with too many rows', () => {
    const noTitle = parseProductSheet(csvBytes('Name,Brand\nWidget,Acme\n'));
    expect(noTitle.ok).toBe(false);
    expect(noTitle.fileErrors.join(' ')).toMatch(/No "Title" column/);

    const rows = Array.from({ length: 51 }, (_, i) => `Product ${i + 1}`).join('\n');
    const tooMany = parseProductSheet(csvBytes(`Title\n${rows}\n`));
    expect(tooMany.ok).toBe(false);
    expect(tooMany.fileErrors.join(' ')).toMatch(/limit is 50/);
  });
});

describe('cell helpers', () => {
  it('parseNumberCell tolerates $ and commas', () => {
    expect(parseNumberCell('$1,234.50')).toBe(1234.5);
    expect(parseNumberCell('')).toBeUndefined();
    expect(parseNumberCell('abc')).toBeNull();
  });

  it('parseYesNo maps common spellings', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('TRUE')).toBe(true);
    expect(parseYesNo('no')).toBe(false);
    expect(parseYesNo('')).toBeUndefined();
    expect(parseYesNo('maybe')).toBeNull();
  });

  it('normalizeCategorySlug strips /cat/ and slashes', () => {
    expect(normalizeCategorySlug('/cat/water-bottles/')).toBe('water-bottles');
    expect(normalizeCategorySlug('Water-Bottles')).toBe('water-bottles');
  });
});

describe('buildProductPageSetFields', () => {
  it('builds schema-exact array items with stable keys and skips failed images', () => {
    const csv =
      'Title,Tier 1 Qty,Tier 1 Price,Decoration 1,Color 1 Name,Color 1 Images,Image 1\n' +
      'Widget,100,4.99,Pad Print,Red,"https://example.com/r1.jpg,https://example.com/r2.jpg",https://example.com/d1.jpg\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];

    expect(collectRowImageUrls(row).sort()).toEqual([
      'https://example.com/d1.jpg',
      'https://example.com/r1.jpg',
      'https://example.com/r2.jpg',
    ]);

    // r2 "failed to upload" — it must be dropped, not referenced.
    const assets = new Map([
      ['https://example.com/r1.jpg', 'image-r1'],
      ['https://example.com/d1.jpg', 'image-d1'],
    ]);
    const set = buildProductPageSetFields(row, assets);

    expect(set.title).toBe('Widget');
    expect(set.pricingTiers).toEqual([
      { _type: 'pricingTier', _key: 'tier-1', minQty: 100, price: 4.99 },
    ]);
    expect(set.decorationMethods).toEqual([
      { _type: 'decorationMethod', _key: 'dec-1', method: 'Pad Print' },
    ]);
    expect(set.defaultImages).toEqual([
      {
        _type: 'image',
        _key: 'img-1',
        asset: { _type: 'reference', _ref: 'image-d1' },
        alt: 'Widget',
      },
    ]);
    expect(set.colorVariants).toEqual([
      {
        _type: 'productColorVariant',
        _key: 'color-1',
        colorName: 'Red',
        images: [
          {
            _type: 'image',
            _key: 'color-1-img-1',
            asset: { _type: 'reference', _ref: 'image-r1' },
            alt: 'Widget — Red',
          },
        ],
      },
    ]);
    // Blank columns must be absent so updates never wipe existing values.
    expect('brand' in set).toBe(false);
    expect('description' in set).toBe(false);
    expect('onSale' in set).toBe(false);
  });

  it('writes per-decoration setup charges including an explicit 0, omitting blanks (Q-100)', () => {
    const csv =
      'Title,Decoration 1,Decoration 1 Upcharge,Decoration 1 Setup,Decoration 2,Decoration 2 Setup,Decoration 3\n' +
      'Widget,Screen Print,0.50,90,Laser Engraving,0,Pad Print\n';
    const row = parseProductSheet(csvBytes(csv)).rows[0];
    const set = buildProductPageSetFields(row, new Map());
    expect(set.decorationMethods).toEqual([
      { _type: 'decorationMethod', _key: 'dec-1', method: 'Screen Print', upcharge: 0.5, setupCharge: 90 },
      { _type: 'decorationMethod', _key: 'dec-2', method: 'Laser Engraving', setupCharge: 0 },
      { _type: 'decorationMethod', _key: 'dec-3', method: 'Pad Print' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCategoryDoc,
  buildItemDoc,
  categoryDocId,
  categorySlug,
  contentTypeFor,
  draftId,
  flaggedForReview,
  hotspotCandidates,
  itemDocId,
  parseImportArgs,
  PORTFOLIO_IMPORT_CATEGORIES,
  totalUploadKb,
  validateImportRecords,
  type PortfolioImportRecord,
} from './import-plan';
import { PORTFOLIO_COLORS } from './colors';
import { PORTFOLIO_DECORATION_METHODS } from './decoration-methods';
import { PORTFOLIO_INDUSTRIES } from './industries';

const NB = '\u202f'; // the narrow no-break space in Apple screenshot names

function record(overrides: Partial<PortfolioImportRecord> = {}): PortfolioImportRecord {
  return {
    sourcePath: 'C:\\photos\\Caps and Hats\\cap.png',
    filename: 'cap.png',
    category: 'Caps and Hats',
    title: 'Embroidered trucker caps for a local business',
    alt: 'Khaki trucker cap with a monogram embroidered on the front',
    description: 'Two-tone trucker caps with the monogram embroidered on the front.',
    colors: ['brown', 'black'],
    clientName: '',
    featured: false,
    displayOrder: 10,
    hidden: false,
    needsReview: false,
    reviewNote: '',
    widthPx: 1764,
    heightPx: 1386,
    fileSizeKb: 2263.7,
    ...overrides,
  };
}

const always = () => true;

describe('category ids and slugs (PORT-141)', () => {
  it('slugs the four folder names the way the schema regex demands', () => {
    expect(categorySlug('T-Shirts')).toBe('t-shirts');
    expect(categorySlug('Caps and Hats')).toBe('caps-and-hats');
    expect(categorySlug('Christmas Ornaments')).toBe('christmas-ornaments');
    expect(categorySlug('Drinkware')).toBe('drinkware');
    for (const c of PORTFOLIO_IMPORT_CATEGORIES) {
      expect(categorySlug(c.title)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('derives the document id from the slug so a second run finds the same document', () => {
    expect(categoryDocId('Caps and Hats')).toBe('portfolioCategory-caps-and-hats');
    expect(categoryDocId('Caps and Hats')).toBe(categoryDocId('Caps and Hats'));
  });

  it('orders the filter buttons T-Shirts, Caps and Hats, Drinkware, Christmas Ornaments', () => {
    expect(PORTFOLIO_IMPORT_CATEGORIES.map((c) => c.title)).toEqual([
      'T-Shirts',
      'Caps and Hats',
      'Drinkware',
      'Christmas Ornaments',
    ]);
    const orders = PORTFOLIO_IMPORT_CATEGORIES.map((c) => c.displayOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('builds a published category document with slug, order and hidden false', () => {
    expect(buildCategoryDoc('Caps and Hats', 20)).toEqual({
      _id: 'portfolioCategory-caps-and-hats',
      _type: 'portfolioCategory',
      title: 'Caps and Hats',
      slug: { _type: 'slug', current: 'caps-and-hats' },
      displayOrder: 20,
      hidden: false,
    });
  });
});

describe('item ids', () => {
  it('is deterministic from the filename and survives the narrow no-break space', () => {
    const name = `Screenshot 2026-09-03 at 9.37.36${NB}AM.png`;
    expect(itemDocId(name)).toBe('portfolioItem-screenshot-2026-09-03-at-9-37-36-am-png');
    expect(itemDocId(name)).toBe(itemDocId(name));
  });

  it('keeps the extension so .png and .jpg of the same name stay distinct', () => {
    expect(itemDocId('photo.png')).not.toBe(itemDocId('photo.jpg'));
  });

  it('produces only characters Sanity accepts in an id', () => {
    const ids = [
      itemDocId('5250-Hanes_Orange-Kiwanis-Charity_Fort-Walton-Beach_Individual-Custom-Shirt.jpg'),
      itemDocId(`Screenshot 2026-09-03 at 9.49.37${NB}AM.png`),
      itemDocId('  weird (name) & stuff.PNG  '),
    ];
    for (const id of ids) expect(id).toMatch(/^portfolioItem-[a-z0-9-]+$/);
  });

  it('prefixes drafts once', () => {
    expect(draftId('portfolioItem-x')).toBe('drafts.portfolioItem-x');
    expect(draftId('drafts.portfolioItem-x')).toBe('drafts.portfolioItem-x');
  });
});

describe('validateImportRecords', () => {
  it('accepts a good record', () => {
    expect(validateImportRecords([record()], always)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a non-array and an empty array', () => {
    expect(validateImportRecords({}, always).ok).toBe(false);
    expect(validateImportRecords([], always).ok).toBe(false);
  });

  it('names the missing required fields', () => {
    const r = validateImportRecords([record({ title: '', alt: '  ', filename: '' })], always);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/missing title/);
    expect(r.errors.join('\n')).toMatch(/missing alt/);
    expect(r.errors.join('\n')).toMatch(/missing filename/);
  });

  it('rejects a colour outside the twenty-value vocabulary and a duplicate colour', () => {
    const bad = validateImportRecords([record({ colors: ['navy'] })], always);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/navy/);
    expect(bad.errors[0]).toContain(PORTFOLIO_COLORS.join(', '));
    const dup = validateImportRecords([record({ colors: ['black', 'black'] })], always);
    expect(dup.ok).toBe(false);
    expect(dup.errors[0]).toMatch(/duplicate/);
  });

  it('accepts every vocabulary value', () => {
    expect(validateImportRecords([record({ colors: [...PORTFOLIO_COLORS] })], always).ok).toBe(true);
  });

  it('rejects a category that is not one of the four folders', () => {
    const r = validateImportRecords([record({ category: 'Bags' })], always);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Bags/);
  });

  it('rejects a sourcePath that does not exist, using the injected predicate', () => {
    const r = validateImportRecords([record()], () => false);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/does not exist on disk/);
  });

  it('mirrors the schema length limits for alt and description', () => {
    expect(validateImportRecords([record({ alt: 'x'.repeat(161) })], always).ok).toBe(false);
    expect(validateImportRecords([record({ alt: 'x'.repeat(160) })], always).ok).toBe(true);
    expect(validateImportRecords([record({ description: 'x'.repeat(401) })], always).ok).toBe(false);
  });

  it('rejects non-boolean flags and a non-integer order', () => {
    const r = validateImportRecords(
      [record({ featured: 'yes' as unknown as boolean, displayOrder: 10.5 })],
      always,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/featured must be true or false/);
    expect(r.errors.join('\n')).toMatch(/displayOrder must be an integer/);
  });

  it('rejects two records with the same filename and two filenames that collide on id', () => {
    const same = validateImportRecords([record(), record()], always);
    expect(same.ok).toBe(false);
    expect(same.errors.join('\n')).toMatch(/more than once/);
    const collide = validateImportRecords(
      [record({ filename: 'a b.png' }), record({ filename: 'a-b.png' })],
      always,
    );
    expect(collide.ok).toBe(false);
    expect(collide.errors.join('\n')).toMatch(/collides/);
  });

  // PORT-160: the two optional fields.
  it('accepts a record with no decorationMethods or industry at all (the pre-PORT-160 file shape)', () => {
    const r = record();
    expect('decorationMethods' in r).toBe(false);
    expect('industry' in r).toBe(false);
    expect(validateImportRecords([r], always)).toEqual({ ok: true, errors: [] });
    expect(validateImportRecords([record({ decorationMethods: null, industry: null })], always).ok).toBe(true);
    expect(validateImportRecords([record({ decorationMethods: [], industry: '' })], always).ok).toBe(true);
  });

  it('accepts every vocabulary decoration method and industry', () => {
    expect(
      validateImportRecords([record({ decorationMethods: [...PORTFOLIO_DECORATION_METHODS], industry: PORTFOLIO_INDUSTRIES[0] })], always).ok,
    ).toBe(true);
    for (const industry of PORTFOLIO_INDUSTRIES) {
      expect(validateImportRecords([record({ industry })], always).ok).toBe(true);
    }
  });

  it('rejects a decoration method or industry outside its vocabulary, naming the allowed values', () => {
    const bad = validateImportRecords([record({ decorationMethods: ['sublimated'] })], always);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/sublimated/);
    expect(bad.errors[0]).toContain(PORTFOLIO_DECORATION_METHODS.join(', '));
    const badIndustry = validateImportRecords([record({ industry: 'military' })], always);
    expect(badIndustry.ok).toBe(false);
    expect(badIndustry.errors[0]).toMatch(/military/);
    expect(badIndustry.errors[0]).toContain(PORTFOLIO_INDUSTRIES.join(', '));
    // Case matters: the stored value is the URL value.
    expect(validateImportRecords([record({ industry: 'Churches' })], always).ok).toBe(false);
    expect(validateImportRecords([record({ decorationMethods: ['Embroidered'] })], always).ok).toBe(false);
  });

  it('rejects the wrong shape and a duplicate decoration method', () => {
    expect(validateImportRecords([record({ decorationMethods: 'embroidered' as unknown as string[] })], always).errors[0]).toMatch(/must be an array/);
    expect(validateImportRecords([record({ industry: ['churches'] as unknown as string })], always).errors[0]).toMatch(/single string/);
    expect(validateImportRecords([record({ decorationMethods: ['etched', 'etched'] })], always).errors[0]).toMatch(/duplicate/);
  });

  it('reports every problem in one pass rather than stopping at the first', () => {
    const r = validateImportRecords(
      [record({ title: '' }), record({ filename: 'b.png', colors: ['navy'] })],
      always,
    );
    expect(r.errors.length).toBe(2);
  });
});

describe('buildItemDoc', () => {
  it('copies every field, puts alt on the image, references category and asset, never sets clientName or slug', () => {
    const doc = buildItemDoc(record({ clientName: '' }), 'image-abc', 'portfolioCategory-caps-and-hats', 'portfolioItem-cap-png');
    expect(doc).toEqual({
      _id: 'portfolioItem-cap-png',
      _type: 'portfolioItem',
      title: 'Embroidered trucker caps for a local business',
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-abc' },
        alt: 'Khaki trucker cap with a monogram embroidered on the front',
      },
      category: { _type: 'reference', _ref: 'portfolioCategory-caps-and-hats' },
      colors: ['brown', 'black'],
      featured: false,
      displayOrder: 10,
      hidden: false,
      description: 'Two-tone trucker caps with the monogram embroidered on the front.',
    });
    expect(doc).not.toHaveProperty('clientName');
    expect(doc).not.toHaveProperty('slug');
  });

  it('omits an empty description instead of storing an empty string', () => {
    const doc = buildItemDoc(record({ description: '' }), 'a', 'c', 'i');
    expect(doc).not.toHaveProperty('description');
  });

  it('does not share the colors array with the record', () => {
    const r = record();
    const doc = buildItemDoc(r, 'a', 'c', 'i');
    expect(doc.colors).not.toBe(r.colors);
  });

  // PORT-160
  it('writes decorationMethods and industry only when the record carries them', () => {
    const without = buildItemDoc(record(), 'a', 'c', 'i');
    expect(without).not.toHaveProperty('decorationMethods');
    expect(without).not.toHaveProperty('industry');
    const empty = buildItemDoc(record({ decorationMethods: [], industry: '' }), 'a', 'c', 'i');
    expect(empty).not.toHaveProperty('decorationMethods');
    expect(empty).not.toHaveProperty('industry');
    const nulls = buildItemDoc(record({ decorationMethods: null, industry: null }), 'a', 'c', 'i');
    expect(nulls).not.toHaveProperty('decorationMethods');
    expect(nulls).not.toHaveProperty('industry');

    const r = record({ decorationMethods: ['embroidered', 'screen-printed'], industry: 'fire-and-ems' });
    const doc = buildItemDoc(r, 'a', 'c', 'i');
    expect(doc.decorationMethods).toEqual(['embroidered', 'screen-printed']);
    expect(doc.decorationMethods).not.toBe(r.decorationMethods);
    expect(doc.industry).toBe('fire-and-ems');
  });
});

describe('hotspotCandidates', () => {
  it('lists items at or above the ratio threshold, tallest first, with the ratio to two decimals', () => {
    const list = hotspotCandidates([
      record({ title: 'Square', widthPx: 1200, heightPx: 1200 }),
      record({ title: 'Bottle', widthPx: 726, heightPx: 2252 }),
      record({ title: 'Cap', widthPx: 1764, heightPx: 1386 }),
      record({ title: 'Wide', widthPx: 2000, heightPx: 1000 }),
    ]);
    expect(list.map((c) => [c.title, c.ratio, c.orientation])).toEqual([
      ['Bottle', 3.1, 'portrait'],
      ['Wide', 2, 'landscape'],
      ['Cap', 1.27, 'landscape'],
    ]);
  });

  it('honours a custom threshold', () => {
    expect(hotspotCandidates([record({ widthPx: 1000, heightPx: 1100 })], 1.05)).toHaveLength(1);
    expect(hotspotCandidates([record({ widthPx: 1000, heightPx: 1100 })])).toHaveLength(0);
  });
});

describe('flags, sizes and content types', () => {
  it('flaggedForReview returns only needsReview records', () => {
    const flagged = record({ filename: 'f.png', needsReview: true, reviewNote: 'crop it' });
    expect(flaggedForReview([record(), flagged])).toEqual([flagged]);
  });

  it('totalUploadKb sums the measured sizes', () => {
    expect(totalUploadKb([record({ fileSizeKb: 100 }), record({ fileSizeKb: 50.5 })])).toBe(150.5);
  });

  it('contentTypeFor knows png and jpeg and nothing else', () => {
    expect(contentTypeFor('a.PNG')).toBe('image/png');
    expect(contentTypeFor('a.jpg')).toBe('image/jpeg');
    expect(contentTypeFor('a.jpeg')).toBe('image/jpeg');
    expect(contentTypeFor('a.webp')).toBeNull();
  });
});

describe('parseImportArgs: dry run is the default and the only safe default', () => {
  it('no flags means dry run', () => {
    expect(parseImportArgs([])).toEqual({ mode: 'dry-run', commit: false, publish: false, file: null });
  });

  it('--dry-run alone is a dry run', () => {
    expect(parseImportArgs(['--dry-run']).mode).toBe('dry-run');
  });

  it('--commit writes drafts, --publish publishes, both together do both', () => {
    expect(parseImportArgs(['--commit'])).toMatchObject({ mode: 'write', commit: true, publish: false });
    expect(parseImportArgs(['--publish'])).toMatchObject({ mode: 'write', commit: false, publish: true });
    expect(parseImportArgs(['--commit', '--publish'])).toMatchObject({ mode: 'write', commit: true, publish: true });
  });

  it('--dry-run beats --commit and --publish, so a line that says dry run never writes', () => {
    expect(parseImportArgs(['--commit', '--dry-run', '--publish'])).toEqual({
      mode: 'dry-run',
      commit: false,
      publish: false,
      file: null,
    });
  });

  it('reads --file <path> and ignores a --file with no value', () => {
    expect(parseImportArgs(['--file', 'C:\\x\\meta.json']).file).toBe('C:\\x\\meta.json');
    expect(parseImportArgs(['--file']).file).toBeNull();
    expect(parseImportArgs(['--file', '--commit']).file).toBeNull();
  });

  it('an unknown flag does not switch on writing', () => {
    expect(parseImportArgs(['--comit', '--publsh']).mode).toBe('dry-run');
  });
});

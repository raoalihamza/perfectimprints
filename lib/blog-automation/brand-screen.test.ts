/**
 * AUTO-220: the brand screen. What it catches is tested on the names the
 * image tests actually met; what it cannot catch is tested too, so nobody
 * reads this module as a guarantee.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNOWN_BRAND_COUNT,
  PICTURE_INVENTORY_READS,
  brandTokens,
  buildPhotoScreenPrompt,
  buildPictureInventoryPrompt,
  findBrand,
  namedLogoHit,
  parsePhotoScreen,
  parsePictureInventory,
  photoScreenVerdict,
  pictureBrandProblem,
  type PictureInventory,
} from './brand-screen';
import { KNOWN_BRANDS } from './brand-list';

describe('the names the image tests met are all caught', () => {
  it('copied from a supplier photo: Delta, Virgin Mobile, Sprint, Wal-Mart, Bud Light, U.S. Cellular, Wells Fargo, GO GATORS', () => {
    expect(findBrand('DELTA')).toBe('Delta');
    expect(findBrand('Virgin mobile')).toBe('Virgin Mobile');
    expect(findBrand('Sprint')).toBe('Sprint');
    expect(findBrand('WAL-MART')).toBe('Walmart');
    expect(findBrand('Wal Mart Supercenter')).toBe('Walmart');
    expect(findBrand('BUD LIGHT')).toBe('Bud Light');
    expect(findBrand('U.S. Cellular')).toBe('US Cellular');
    expect(findBrand('Wells Fargo Home Mortgage')).toBe('Wells Fargo');
    expect(findBrand('GO GATORS!')).toBe('Go Gators');
    expect(findBrand('Sun Life Stadium')).toBe('Sun Life');
  });

  it('invented by the model out of a garbled imprint: DURAFLOW came back as DUNLOP, DULUTH TRADING, DULUTH and DUNHAM', () => {
    expect(findBrand('DUNLOP')).toBe('Dunlop');
    expect(findBrand('DULUTH TRADING')).toBe('Duluth Trading');
    expect(findBrand('DULUTH')).toBe('Duluth');
    expect(findBrand('DUNHAM')).toBe('Dunham');
  });
});

describe('what is NOT a hit', () => {
  it("the supplier's invented sample names pass (they are on no list, and that is correct)", () => {
    for (const invented of ['DURAFLOW', 'CEPOWER', 'East Cove UMC Group', 'Feeding Families Food Bank', 'Autumn Harvest', 'DECKER CYCLES', 'JOY', 'SPRING BREAK', 'Fairbanks National ZOO', 'SHOCK', 'mio', 'Riverside Bank']) {
      expect(findBrand(invented), invented).toBeNull();
    }
  });

  it('a name that is also an ordinary word or a surname is a hit only when it is the WHOLE text', () => {
    expect(findBrand('Delta')).toBe('Delta');
    expect(findBrand('Delta Plumbing Supply')).toBeNull();
    expect(findBrand('TARGET')).toBe('Target');
    expect(findBrand('Target your audience')).toBeNull();
    expect(findBrand('Chase')).toBe('Chase');
    expect(findBrand('Chase the dream 5K')).toBeNull();
    expect(findBrand('Hilton Head Chamber of Commerce')).toBeNull();
    expect(findBrand('Hilton Hotels')).toBe('Hilton Hotels');
    expect(findBrand("Wendy's Flowers")).toBeNull();
    expect(findBrand('Notre Dame High School')).toBeNull();
    expect(findBrand('The Coca-Cola Company')).toBe('Coca-Cola');
    expect(findBrand('Apple Inc.')).toBe('Apple');
  });

  it('a short name is matched as one word, never as letters run together, and never inside a longer word', () => {
    expect(findBrand('Nike')).toBe('Nike');
    expect(findBrand('ni ke')).toBeNull();
    expect(findBrand('Targeted Marketing')).toBeNull();
    expect(findBrand('Subwayfare')).toBeNull();
  });

  it("a product's own maker is allowed: its catalogue brand, its name, or the post's own title", () => {
    expect(findBrand('STANLEY')).toBe('Stanley');
    expect(findBrand('STANLEY', { allowed: ['20 oz Stanley Activate Shaker Bottle'] })).toBeNull();
    expect(findBrand('KOOZIE', { allowed: ['', 'KOOZIE'] })).toBeNull();
    expect(findBrand('Yeti', { allowed: ['Yeti Style Coolers for Events'] })).toBeNull();
    // Allowing one name does not allow another.
    expect(findBrand('Nike', { allowed: ['20 oz Stanley Bottle', 'STANLEY'] })).toBe('Nike');
  });

  it('a logo the reader NAMED counts wherever the name sits in the phrase; a plain text does not get that leniency', () => {
    expect(findBrand('Apple logo on a laptop lid')).toBeNull();
    expect(findBrand('Apple logo on a laptop lid', { lenient: true })).toBe('Apple');
    expect(findBrand('the Nike swoosh', { lenient: true })).toBe('Nike');
    expect(findBrand('an unfamiliar leaf emblem', { lenient: true })).toBeNull();
  });

  it('nothing in, nothing out', () => {
    for (const empty of ['', '   ', null, undefined, 12]) expect(findBrand(empty)).toBeNull();
  });
});

describe('a logo the reader NAMES is a hit even when no list holds it (measured, AUTO-220)', () => {
  // The stress toys sample: the photo reads named Telemundo, Citrix and the NYPD, none of them on the
  // list, and the finished picture went out with the Telemundo ball on it. Over 35 archived pictures
  // read twice and about 35 photo reads the reader named a logo 20 times and every one was real;
  // it named none on the 23 pictures that carry no real mark.
  it('the names it gave on the stress toy and tote photos are hits although the list does not hold them', () => {
    for (const name of ['Telemundo', 'NYPD', "Texas Woman's University"]) {
      expect(findBrand(name, { lenient: true })).toBeNull();
      expect(namedLogoHit(name)).toBe(name);
    }
  });

  it('a listed name comes back as the list spells it, wherever it sits in the phrase', () => {
    expect(namedLogoHit('Delta Air Lines')).toBe('Delta');
    expect(namedLogoHit('Apple logo on a laptop lid')).toBe('Apple');
    // The first listed name the phrase spells wins, as for a text.
    expect(namedLogoHit('Duluth Trading Company')).toBe('Duluth');
  });

  it('what the reader adds around an unlisted name is cut off: the name alone is reported', () => {
    expect(namedLogoHit('Telemundo logo on the soccer ball')).toBe('Telemundo');
    expect(namedLogoHit('the Citrix wordmark')).toBe('Citrix');
    expect(namedLogoHit('NYPD (New York Police Department)')).toBe('NYPD');
  });

  it("the product's own maker, the post's own title and our own name are never hits, listed or not", () => {
    expect(namedLogoHit('Performa', ['Performa PerfectShaker 28 oz', ''])).toBeNull();
    expect(namedLogoHit('Performa', ['28 oz Shaker Bottle', 'Performa'])).toBeNull();
    // The catalogue says BIC, the reader says Bic Graphic: the maker is inside the name.
    expect(namedLogoHit('Bic Graphic', ['Clic Stic Pen', 'BIC'])).toBeNull();
    expect(namedLogoHit('Skullcandy', ['Skullcandy Cassette Headphones', 'Skullcandy'])).toBeNull();
    expect(namedLogoHit('Moleskine', ['x'].concat('Custom Moleskine Notebooks for Business'))).toBeNull();
    expect(namedLogoHit('Perfect Imprints')).toBeNull();
    expect(namedLogoHit('Performa', ['24 oz Shake-It Bottle', ''])).toBe('Performa');
  });

  it('an answer that names nothing is not a hit', () => {
    for (const none of ['', '   ', 'unknown', 'Unknown logo', 'none', 'N/A', 'generic shield emblem', 'an unfamiliar leaf emblem', 'no logo', 'made-up company logo', 'AB', null, undefined, 7]) {
      expect(namedLogoHit(none)).toBeNull();
    }
  });
});

describe('the reference photos (layer 1)', () => {
  it('a photo is not sent when its imprint or a recognised logo is a listed brand that is not the product\'s own', () => {
    const product = { name: '24 oz Shake-It Bottle', brand: null };
    expect(photoScreenVerdict({ imprints: ['Virgin mobile'], logos: ['Virgin'], kind: 'a shaker bottle', subject: true }, product, 'Custom Shaker Bottles')).toEqual({ brand: 'Virgin Mobile', offSubject: false, onSubject: true });
    expect(photoScreenVerdict({ imprints: [], logos: ['Skullcandy'], kind: 'headphones', subject: true }, { name: 'Wireless Headphones', brand: null }, 'x').brand).toBe('Skullcandy');
    expect(photoScreenVerdict({ imprints: ['Heist'], logos: ['Skullcandy'], kind: 'headphones', subject: true }, { name: 'Skullcandy Cassette Headphones', brand: 'Skullcandy' }, 'x').brand).toBeNull();
  });

  it('a photo whose logo the reader names is not sent even when the list does not hold the name (the Telemundo ball)', () => {
    const screen = { imprints: ['LA CADENA OFICIAL DEL TRI', 'T39', 'TELEMUNDO'], logos: ['Telemundo'], kind: 'a soccer ball stress toy', subject: true };
    expect(photoScreenVerdict(screen, { name: 'Soccer Stress Ball', brand: null }, '10 Custom Stress Toys That Work for Busy Teams').brand).toBe('Telemundo');
    // The same imprint with no logo named passes: a text is only ever checked against the list.
    expect(photoScreenVerdict({ ...screen, logos: [] }, { name: 'Soccer Stress Ball', brand: null }, 't').brand).toBeNull();
  });

  it('the subject verdict is the reader\'s; saying nothing is neither yes nor no', () => {
    const p = { name: 'Gourmet Spice and Rub Bottle Shaker' };
    expect(photoScreenVerdict({ imprints: [], logos: [], kind: 'a spice shaker', subject: false }, p, 't')).toMatchObject({ offSubject: true, onSubject: false });
    expect(photoScreenVerdict({ imprints: [], logos: [], kind: '', subject: null }, p, 't')).toMatchObject({ offSubject: false, onSubject: false });
    // A photo that could not be read passes the brand test and is neither on nor off the subject (layer 1 fails open).
    expect(photoScreenVerdict(null, p, 't')).toEqual({ brand: null, offSubject: false, onSubject: false });
  });

  it('the question asks what the product IS before whether it is the subject, and its example is not the shaker case', () => {
    const { user } = buildPhotoScreenPrompt({ productName: 'Perfect Shaker', title: 'Custom Shaker Bottles for Gyms', topic: 'custom shaker bottles' });
    expect(user.indexOf('3. kind:')).toBeGreaterThan(-1);
    expect(user.indexOf('3. kind:')).toBeLessThan(user.indexOf('4. subject:'));
    expect(user).toContain('titled "Custom Shaker Bottles for Gyms" (the post is about: custom shaker bottles)');
    // The prompt must not recite the answer to the case it was built for.
    const rules = user.slice(user.indexOf('Report:'));
    expect(rules).not.toMatch(/shaker|spice|cocktail|martini/i);
  });

  it('the answer is read defensively', () => {
    expect(parsePhotoScreen({ imprints: ['A', ' A ', 7, ''], logos: ['Nike'], kind: ' a  cap ', subject: true })).toEqual({ imprints: ['A'], logos: ['Nike'], kind: 'a cap', subject: true });
    expect(parsePhotoScreen({ imprints: [], logos: [] })).toEqual({ imprints: [], logos: [], kind: '', subject: null });
    for (const bad of [null, 'x', [], {}, { kind: 'x' }]) expect(parsePhotoScreen(bad)).toBeNull();
  });
});

describe('the finished picture (layer 3)', () => {
  const inv = (...texts: string[]): PictureInventory => ({ texts: texts.map((text) => ({ text, where: 'product' as const })), logos: [] });
  const context = { title: 'Engraved Pens for Business', products: [{ name: 'Amesbury Pen', brand: null }] };

  it('is read twice, and a hit in EITHER read counts', () => {
    expect(PICTURE_INVENTORY_READS).toBe(2);
    expect(pictureBrandProblem([inv('DURAFLOW'), inv('DUNLOP')], context)).toBe('Dunlop');
    expect(pictureBrandProblem([null, inv('CEPOWER', 'Sprint')], context)).toBe('Sprint');
    expect(pictureBrandProblem([inv('DURAFLOW', 'CEPOWER'), inv('DURAFLOW')], context)).toBeNull();
    expect(pictureBrandProblem([null, null], context)).toBeNull();
  });

  it('every text is checked wherever the reader filed it: a caption, a sign, even one filed as the title', () => {
    const read: PictureInventory = { texts: [{ text: 'Engraved Pens for Business', where: 'title' }, { text: 'Bulk Discounts', where: 'other' }, { text: 'Coca-Cola', where: 'title' }], logos: [] };
    expect(pictureBrandProblem([read], context)).toBe('Coca-Cola');
  });

  it('invented captions are not brands: "Bulk Discounts" and "Cost Savings" pass (Ali\'s decision)', () => {
    const read: PictureInventory = { texts: [{ text: 'Bulk Discounts', where: 'other' }, { text: 'Cost Savings', where: 'other' }, { text: 'BLOG', where: 'other' }, { text: 'SUPPORT YOUR CAUSE', where: 'other' }], logos: [] };
    expect(pictureBrandProblem([read], context)).toBeNull();
  });

  it('a logo the reader names on the finished picture is a hit, listed or not; the post\'s own products are allowed', () => {
    const stress = { title: '10 Custom Stress Toys That Work for Busy Teams', products: [{ name: 'Soccer Stress Ball', brand: null }] };
    const read: PictureInventory = { texts: [{ text: 'T39 TELEMUNDO', where: 'product' }, { text: 'AVIALL Let us be a part of your team!', where: 'product' }], logos: ['Telemundo'] };
    expect(pictureBrandProblem([read], stress)).toBe('Telemundo');
    // The texts alone are checked against the list only, so the same picture with no logo named passes.
    expect(pictureBrandProblem([{ ...read, logos: [] }], stress)).toBeNull();
    expect(pictureBrandProblem([{ texts: [], logos: ['Koozie'] }], { title: 't', products: [{ name: 'Collapsible Can Cooler', brand: 'KOOZIE' }] })).toBeNull();
  });

  it('WHAT IT CANNOT CATCH: a real organisation that is not on the list, and a logo the reader did not name', () => {
    // AUTO-209 Part 6 found most real imprints are local organisations like these; no list holds them.
    expect(pictureBrandProblem([inv('MidWest Regional Credit Union', 'St. Mary Medical Center', 'Liam & Sons Roofing')], context)).toBeNull();
    expect(pictureBrandProblem([{ texts: [], logos: [] }], context)).toBeNull();
  });

  it('the inventory prompt lists and does not judge, and its answer is read defensively', () => {
    const { system, user } = buildPictureInventoryPrompt();
    expect(system).toContain('You list, you do not judge');
    expect(user).toContain('EVERY piece of readable writing');
    expect(user).toContain('Do not guess');
    expect(parsePictureInventory({ texts: [{ text: ' A  B ', where: 'title' }, { text: 'c', where: 'weird' }, { text: 3 }, null], logos: ['Nike', 7] })).toEqual({
      texts: [{ text: 'A B', where: 'title' }, { text: 'c', where: 'other' }],
      logos: ['Nike'],
    });
    for (const bad of [null, 'x', [], {}, { logos: [] }]) expect(parsePictureInventory(bad)).toBeNull();
  });
});

describe('the list', () => {
  it('holds several hundred names, each once', () => {
    expect(KNOWN_BRAND_COUNT).toBeGreaterThan(450);
    const compact = KNOWN_BRANDS.map((n) => brandTokens(n.replace(/^=/, '')).join(''));
    expect(compact.every((c) => c.length > 0)).toBe(true);
    const twice = compact.filter((c, i) => compact.indexOf(c) !== i);
    expect(twice).toEqual([]);
  });

  it('every name of three letters or fewer is an exact-only entry (it would match too much otherwise)', () => {
    const loose = KNOWN_BRANDS.filter((n) => !n.startsWith('=') && brandTokens(n).join('').length <= 3);
    expect(loose).toEqual([]);
  });

  it('the matching module is pure, and the list is data with no imports', () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
    expect(read('lib/blog-automation/brand-screen.ts').match(/^import .*$/gm)).toEqual(["import { KNOWN_BRANDS } from './brand-list';"]);
    expect(read('lib/blog-automation/brand-list.ts').match(/^import .*$/gm) ?? []).toEqual([]);
  });

  it('nothing here claims a picture is safe: the header says what it cannot do', () => {
    const src = readFileSync(join(process.cwd(), 'lib/blog-automation/brand-screen.ts'), 'utf8');
    expect(src).toContain('This REDUCES');
    expect(src).toContain('It does not end it');
  });
});

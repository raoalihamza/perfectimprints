/**
 * FIX-911: the category resolver's own test. Until this file it had none
 * (FIX-910 found it only mocked, in its callers' tests).
 *
 * HOW THIS IS INDEPENDENT OF THE PRODUCT PULL. The three copies of the repo
 * carry different products.json files (May 2026 and September 2026), and the
 * resolver now reads product names. So:
 *
 *   - Every RULE is tested against a FIXTURE written into this file: a
 *     miniature of the real roots, with names modelled on the real ones
 *     ("Collapsible KOOZIE Can Cooler", "Key Tag - House"). No disk, no
 *     Sanity, the same answer everywhere.
 *   - The block that runs the real `resolveCategoryForKeywords` asserts only
 *     what the 465 root SLUGS decide (they are identical in every copy) and
 *     properties that hold for any catalogue. Under vitest there is no
 *     Sanity, so the evidence is the baked lists; that path is the
 *     documented fallback and is exercised here on purpose.
 *
 * The first describe block is the pin written BEFORE the change, against the
 * old slug-only resolver; each line says what the old rule answered.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NON_SIGNIFICANT_MATCH_WORDS, PRODUCT_MATCH_NON_SIGNIFICANT_WORDS } from './brand-voice';
import { assembleCategoryEvidence } from './category-evidence';
import {
  buildCategoryIndex,
  categoryCandidates,
  EVIDENCE_TIE_POINTS,
  MIN_EVIDENCE_PRODUCTS,
  MIN_EVIDENCE_SHARE,
  resolveCategoryFromIndex,
  type CategoryEvidence,
} from './category-resolver';
import { carriesToken, productPhraseTokens, significantTokens } from './match-tokens';
import { productNounOf, resolveCategoryForKeywords } from './related-products';
import { getAllGeneratedRootSlugs } from '../categories';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');
const many = (n: number, name: (i: number) => string) => Array.from({ length: n }, (_, i) => name(i + 1));

/** A miniature of the real roots. Names are modelled on the real catalogue. */
const FIXTURE: CategoryEvidence[] = [
  {
    slug: 'koozies',
    names: [
      'Collapsible KOOZIE Can Cooler',
      'Deluxe Collapsible KOOZIE Can Cooler',
      'KOOZIE Duo Can Cooler',
      'Koozie Slim Can Cooler',
      'Original KOOZIE Can Cooler',
      'KOOZIE Magnetic Can Cooler',
      'Bottle Opener KOOZIE Can Cooler',
      'Zip-Up Bottle KOOZIE Cooler',
      'Collapsible KOOZIE Bottle Cooler',
      'Bottle Bag',
    ],
  },
  {
    slug: 'coolers',
    names: [
      'Hard Top Cooler',
      'Backpack Cooler',
      'Cooler Caddy Jr',
      'Coleman 54-Quart Classic Steel Belted Cooler',
      'Jumbo Cooler Tote',
      'Newport Cooler Bag',
      'Otaria Cooler Tote',
      'Igloo Terrain Cooler',
      'Collapsible 2-In-1 Trunk Organizer/Cooler',
      '6-Can Cooler Bag',
    ],
  },
  // A department: MORE can-cooler names than the koozies root (8 against 7), a much smaller share (8%).
  { slug: 'lunch-bags-boxes-totes', names: [...many(8, (i) => `${i * 6}-Can Cooler Bag`), ...many(92, (i) => `Lunch Bag ${i}`)] },
  { slug: 'photo-frames', names: ['Sunglasses Photo Frame', 'Curve Photo Frame', 'Acrylic Desktop Photo Frame', 'Wifi Photo Frame', 'Wood Photo Frame'] },
  { slug: 'ornaments', names: ['Ceramic Ornament', 'Wood Ornament', 'Metal Ornament', 'Acrylic Holiday Ornament', 'Snow Globe Ornament', 'Stocking Ornament'] },
  { slug: 'magnets', names: ['Calendar House Magnet', 'Business Card Magnet', 'Circle Magnet', 'Schedule Magnet', 'Info-Mag Magnet', 'Church Magnet'] },
  { slug: 'sunglasses', names: ['Malibu Sunglasses', 'Retro Sunglasses', 'Aviator Sunglasses', 'Neon Bright Sunglasses', 'Cotton Eyewear Retainer', 'Trade Show Lanyard'] },
  { slug: 'golf', names: ['Golf Buddy', 'Golf Ball Caddy', 'Gold Golf Kit', 'Golf/Sports Towel', 'Golf Tee Carrier', 'Divot Tool'] },
  { slug: 'bottle-openers', names: ['Pub Vinyl Bottle Opener', 'Open Sesame Bottle Opener', 'Bottle Opener Key Light', 'Speed Bottle Opener'] },
  // The real keychains root: 75 products, almost all named "Key Tag".
  {
    slug: 'keychains',
    names: ['Key Tag - House', 'Key Tag - Star', 'Standard Oval Key Tag', 'Rectangular Soft Key Tag', 'Key Tag - Van', 'Key Tag - Heart', 'Paw Flexible Key Tag', 'Key Tag - Apple', 'Key Tag - USA', 'Silver Twist-Lock Keyholder', 'The Key Flashlight Keychain'],
  },
  { slug: 'wine-openers', names: ['Tuscany Wine Opener', 'The Curve Wine Opener', "Waiters's Wine Opener"] },
  { slug: 'multi-function-tools', names: ['Hammer Multi-Tool', 'Chipper Multi-Tool', 'Gripper Multi-Tool', 'Cocktail Multi Tool'] },
  { slug: 'journals-notebooks', names: ['Mason Notebook', 'Durham Notebook', '5X7 Journal Notebook', 'Classic Notebook', 'Bari Notebook'] },
  { slug: 'yard-signs', names: ['Double-Sided Yard Sign', 'Full Color Yard Sign', 'Corrugated Yard Sign'] },
  { slug: 'banners-mats-signs', names: ['Small Banner', 'Counter Mat', 'Floor Mat', 'A-Frame Sign'] },
  { slug: 'spirit-hands-signs-sticks', names: ['Spirit Hand', 'Foam Finger', 'Cheer Stick'] },
  { slug: 'poker-sets', names: ['Poker Chip Set', 'Travel Poker Set', 'Card Game Set', 'Domino Set'] },
  { slug: 'gift-sets-bundles', names: ['Speakeasy Gift Set', 'Perfect 3 Gift Set', 'Hot-N-Cold Gift Set', 'Wine Gift Set'] },
  { slug: 'power-banks-chargers', names: ['Flash Power Bank', 'UL Keychain Power Bank', 'Wireless Charger', 'Power Play 10K Power Bank'] },
  { slug: 'water-bottles', names: ['25 oz Infusion Water Bottle', 'Sport Pint Water Bottle', 'Aluminum Water Bottle', 'Glass Water Bottle', 'Stainless Steel Water Bottle'] },
  { slug: 'tote-bags', names: ['Tote Bag', 'The Oak Tote Bag', 'Zeus Tote', 'Eros Tote', 'Canvas Tote', 'Budget Tote', 'Grocery Tote', 'Convention Tote', 'Beach Tote', 'Jute Tote'] },
  // A root whose slug says nothing, holding a LARGER share of "tote bag" names than tote-bags does.
  { slug: 'non-adhesive', names: ['Economy Tote Bag', 'Laminated Tote Bag', 'Sticky Pad', 'Memo Pad'] },
  {
    slug: 'sunscreen',
    names: ['.5 oz SPF 30 Sunscreen', 'Sunscreen Spray', 'SPF 30 Sunscreen in Clear Round Bottle', 'SPF 30 Sunscreen in Clear Bottle with Carabiner', 'SPF 50 Sunscreen Stick', 'Squeeze Pouch Sunscreen', 'SPF 15 Lip Balm in White Tube', 'Chap Ice SPF 15 Lip Balm'],
  },
  { slug: 'selfie-sticks', names: ['Selfie Stick', 'Bluetooth Selfie Stick'] },
  { slug: 'thunder-sticks', names: ['Thunder Sticks', 'Inflatable Noise Sticks'] },
  // Two department dumps: the slug's word is on one product in twenty.
  { slug: 'pre-roll-tubes', names: ['Small Truffle Tube', ...many(19, (i) => `Grinder ${i}`)] },
  { slug: 'arm-sleeves', names: ['Reversible Neoprene Laptop Sleeve', ...many(19, (i) => `Laptop Case ${i}`)] },
  { slug: 'caps', names: ['Richardson Trucker Cap', 'Richardson Low Profile Trucker Cap', 'Foam Trucker Cap', 'Rainbow Trucker Cap', 'Coal Pines 6-Panel Hat', 'Performance Rope Cap'] },
  { slug: 'cards', names: ['Playing Card Set', 'Playing Cards In Case', 'Card Game Assortment'] },
  // The real sports-balls root: a 60-product fallback list plus the two footballs Patrick added.
  { slug: 'sports-balls', names: ['6" Plastic Mini Footballs', '7" Foam Mini Footballs', ...many(28, (i) => `Event Banner ${i}`)] },
  { slug: 'stress-relievers-balls', names: ['Football Stress Reliever', 'Van Stress Reliever', 'Pig Stress Reliever', 'Stress Ball', 'Car Stress Reliever', 'Cow Stress Reliever'] },
  { slug: 'measuring-cups', names: ['One-Cup Measuring Cup', 'Two-Cup Measuring Cup', 'Measuring Spoon Set', 'Magnetic Measuring Spoon Set', 'Adjustable Measuring Spoon'] },
  { slug: 'lip-balm', names: ['Natural Lip Balm', 'Lip Balm in White Tube', 'Tinted Lip Balm', 'Lip Balm Ball', 'Mint Lip Balm'] },
  { slug: 'yoga-items', names: ['Yoga Mat', 'Yoga Block', 'Yoga Strap'] },
  // An empty CTA root.
  { slug: 'products', names: [] },
];
const INDEX = buildCategoryIndex(FIXTURE);
const pick = (phrase: string) => resolveCategoryFromIndex(phrase, INDEX);
const top = (phrase: string) => categoryCandidates(phrase, INDEX)[0];
const namesOf = (slug: string) => FIXTURE.find((f) => f.slug === slug)!.names;
const carryAll = (slug: string, phrase: string) =>
  namesOf(slug).filter((n) => productPhraseTokens(phrase).every((t) => carriesToken(new Set(significantTokens(n)), t))).length;

describe('the pin written before FIX-911: what the old slug-only resolver answered', () => {
  // Rule 1 (the slug carries the whole phrase) is the old rule kept as it was,
  // so every phrase the old resolver matched in full answers the same today.
  it.each([
    ['koozies', 'koozies'],
    ['custom koozies', 'koozies'],
    ['power banks', 'power-banks-chargers'],
    ['custom power banks', 'power-banks-chargers'],
    ['water bottles', 'water-bottles'],
    ['tote bags', 'tote-bags'],
    ['stress relievers', 'stress-relievers-balls'],
    ['wine openers with flashlights', 'wine-openers'],
  ])('unchanged: %s -> %s', (phrase, slug) => {
    expect(pick(phrase)).toBe(slug);
    expect(top(phrase).rule).toBe('exact');
  });

  // The old answers FIX-910 measured as wrong. Each is asserted to be gone.
  it.each([
    ['collapsible can coolers', 'coolers', 'koozies'],
    ['can coolers', 'coolers', 'koozies'],
    ['foam can coolers', 'coolers', 'koozies'],
    ['stainless steel can coolers', 'coolers', 'koozies'],
    ['photo frame ornaments', 'photo-frames', 'ornaments'],
    ['photo frame magnets', 'photo-frames', 'magnets'],
    ['bottle opener koozies', 'bottle-openers', 'koozies'],
    ['golf tournament sunglasses', 'golf', 'sunglasses'],
    ['measuring spoon sets', 'poker-sets', 'measuring-cups'],
  ])('%s: was %s, is %s', (phrase, was, is) => {
    expect(pick(phrase)).not.toBe(was);
    expect(pick(phrase)).toBe(is);
  });

  // Old answers from one incidental slug word. The honest answer is none.
  it.each([
    ['neoprene bottle sleeves', 'arm-sleeves'],
    ['cassette tape shaped items', 'yoga-items'],
    ['neon signs', 'yard-signs'],
    ['test tubes', 'pre-roll-tubes'],
    ['footballs', null],
    ['recycled trucker hats', null],
  ])('%s: was %s, is no category', (phrase, was) => {
    if (was) expect(pick(phrase)).not.toBe(was);
    expect(pick(phrase)).toBeNull();
  });
});

describe('rules 2 and 3: a slug or product names carry the tail of the phrase', () => {
  it('reads product names: the koozies root is found although its slug shares no word with the phrase', () => {
    const c = top('collapsible can coolers');
    expect(c.slug).toBe('koozies');
    expect(c.rule).toBe('tail-names');
    expect(c.words).toEqual(['collapsible', 'can', 'coolers']);
    expect(c.products).toBe(2);
  });

  it('drops leading modifiers until the names answer ("foam can coolers" -> "can coolers")', () => {
    const c = top('foam can coolers');
    expect(c.slug).toBe('koozies');
    expect(c.words).toEqual(['can', 'coolers']);
    expect(c.products).toBe(7);
  });

  it('ranks by SHARE: a department with more matching names and a smaller share is not even a candidate', () => {
    expect(carryAll('lunch-bags-boxes-totes', 'can coolers')).toBeGreaterThan(carryAll('koozies', 'can coolers'));
    expect(pick('can coolers')).toBe('koozies');
    expect(categoryCandidates('can coolers', INDEX).map((c) => c.slug)).not.toContain('lunch-bags-boxes-totes');
  });

  it('one matching product is not evidence: the hard-cooler root has one can cooler bag', () => {
    expect(carryAll('coolers', 'can coolers')).toBe(1);
    expect(categoryCandidates('foam can coolers', INDEX).filter((c) => c.rule === 'tail-names').map((c) => c.slug)).toEqual(['koozies']);
  });

  it('a slug that carries a two-word tail comes before any product-name evidence', () => {
    // non-adhesive holds half its list in "tote bag" names; tote-bags is the category.
    expect(carryAll('non-adhesive', 'tote bags') / namesOf('non-adhesive').length).toBeGreaterThan(
      carryAll('tote-bags', 'tote bags') / namesOf('tote-bags').length,
    );
    expect(pick('test tote bags')).toBe('tote-bags');
    expect(top('test tote bags').rule).toBe('tail-slug');
    expect(pick('stainless steel water bottles')).toBe('water-bottles');
    // Even against names for a LONGER tail: two of the eight sunscreen-root
    // names are SPF lip balms (25%), and lip-balm is the category named for it.
    expect(carryAll('sunscreen', 'spf lip balm')).toBe(2);
    expect(top('spf lip balm')).toMatchObject({ slug: 'lip-balm', rule: 'tail-slug' });
    expect(categoryCandidates('spf lip balm', INDEX).map((c) => c.slug)).toEqual(['lip-balm', 'sunscreen']);
  });

  it('stops at two words: a long phrase is never resolved on one word found in product names', () => {
    // "Football Stress Reliever" and two "Mini Footballs" carry the last word; that is not a category.
    expect(pick('glow in the dark footballs')).toBeNull();
    expect(pick('full-size composite footballs')).toBeNull();
  });

  it('a one-word phrase is its own tail, and still needs the share', () => {
    // 2 of 30 products in sports-balls are footballs.
    expect(pick('footballs')).toBeNull();
    expect(pick('promotional footballs')).toBeNull();
  });

  it('the thresholds are the measured ones', () => {
    // FIX-911 measured 0.05 and 0.2 for the share and 3 for the count on the
    // 107 labelled strips: 11 to 12 drifted strips at every setting. Changing
    // either constant needs that measurement redone, not a guess.
    expect(MIN_EVIDENCE_PRODUCTS).toBe(2);
    expect(MIN_EVIDENCE_SHARE).toBe(0.1);
  });
});

describe('rule 3, one shelf under two names (FIX-920)', () => {
  // Two PI slugs often map to one Geiger category, so two roots show the same
  // products. The real pairs, in miniature: bottled-water / water-bottles (142
  // and 143 products), markers / highlighters (34 each), and the pair that
  // must NOT flip, koozies / coolers (43% against 33%).
  const SHELVES: CategoryEvidence[] = [
    { slug: 'bottled-water', names: [...many(17, (i) => `${i * 2} oz Mood Sports Bottle`), ...many(125, (i) => `Tritan Tumbler ${i}`)] },
    { slug: 'water-bottles', names: [...many(17, (i) => `${i * 2} oz Mood Sports Bottle`), ...many(126, (i) => `Tritan Tumbler ${i}`)] },
    { slug: 'markers', names: [...many(8, (i) => `Gel Highlighter Pen ${i}`), ...many(26, (i) => `Dry Erase Marker ${i}`)] },
    { slug: 'highlighters', names: [...many(8, (i) => `Gel Highlighter Pen ${i}`), ...many(26, (i) => `Dry Erase Marker ${i}`)] },
    { slug: 'koozies', names: [...many(33, (i) => `KOOZIE Can Cooler ${i}`), ...many(43, (i) => `Bottle Bag ${i}`)] },
    { slug: 'coolers', names: [...many(26, (i) => `${i * 6}-Can Convertible Cooler`), ...many(52, (i) => `Hard Top Chest ${i}`)] },
    // 50.0%, 49.5% and 48.8%: the third is within a point of the second and not of the leader.
    { slug: 'alpha', names: [...many(100, (i) => `Glow Yo Disc ${i}`), ...many(100, (i) => `Filler ${i}`)] },
    { slug: 'beta', names: [...many(99, (i) => `Glow Yo Disc ${i}`), ...many(101, (i) => `Filler ${i}`)] },
    { slug: 'glow-toys', names: [...many(122, (i) => `Glow Yo Disc ${i}`), ...many(128, (i) => `Filler ${i}`)] },
  ];
  const SHELF_INDEX = buildCategoryIndex(SHELVES);
  const order = (phrase: string) => categoryCandidates(phrase, SHELF_INDEX).filter((c) => c.rule === 'tail-names').map((c) => c.slug);

  it('"sports bottles" is water-bottles, not bottled-water, although its share is a hair smaller', () => {
    const [first, second] = categoryCandidates('imprinted sports bottles', SHELF_INDEX);
    expect(second.share!).toBeGreaterThan(first.share!);
    expect(second.share! - first.share!).toBeLessThan(EVIDENCE_TIE_POINTS);
    expect(first).toMatchObject({ slug: 'water-bottles', rule: 'tail-names', products: 17 });
    expect(second.slug).toBe('bottled-water');
    expect(resolveCategoryFromIndex('promotional sports bottles', SHELF_INDEX)).toBe('water-bottles');
  });

  it('an exact tie goes to the slug that carries the phrase, not to the shorter slug', () => {
    expect(order('printed highlighter pens')).toEqual(['highlighters', 'markers']);
    expect(resolveCategoryFromIndex('printed highlighter pens', SHELF_INDEX)).toBe('highlighters');
  });

  it('a real gap is still decided by the share: "can coolers" stays with koozies, whose slug shares no word', () => {
    // The hard-cooler root's slug carries "coolers" and is the WRONG root; ten points apart is not a tie.
    expect(order('collapsible can coolers')).toEqual(['koozies', 'coolers']);
    expect(resolveCategoryFromIndex('foam can coolers', SHELF_INDEX)).toBe('koozies');
  });

  it('only the LEADING group is reordered: a root within a point of the second, but not of the leader, keeps its place', () => {
    expect(order('glow yo disc')).toEqual(['alpha', 'beta', 'glow-toys']);
  });

  it('the tie is one percentage point, spelled once', () => {
    expect(EVIDENCE_TIE_POINTS).toBe(0.01);
    expect(read('lib/ai/category-resolver.ts').match(/export const EVIDENCE_TIE_POINTS = [\d.]+;/g)).toEqual(['export const EVIDENCE_TIE_POINTS = 0.01;']);
  });
});

describe('rule 4: a root the phrase names outright, verified by its own product names', () => {
  it('the root named furthest right wins', () => {
    expect(top('photo frame ornaments')).toMatchObject({ slug: 'ornaments', rule: 'named' });
    expect(categoryCandidates('photo frame ornaments', INDEX).map((c) => c.slug)).toEqual(['ornaments', 'photo-frames']);
    expect(pick('golf tournament sunglasses')).toBe('sunglasses');
    expect(pick('ornament sets')).toBe('ornaments');
  });

  it('a root whose products do not carry its own word is refused, and the next is tried', () => {
    // 1 of 11 keychains-root names says "keychain"; the rest are Key Tags.
    expect(categoryCandidates('wine opener keychains', INDEX).map((c) => c.slug)).not.toContain('keychains');
    expect(pick('wine opener keychains')).toBe('wine-openers');
    expect(pick('arcade keychains')).toBeNull();
  });

  it('a form-factor phrasing keeps its category: the product is the first word and the root is named', () => {
    expect(pick('sunscreen packets')).toBe('sunscreen');
    expect(pick('sunscreen sticks')).toBe('sunscreen');
    expect(pick('sunscreen tubes')).toBe('sunscreen');
  });
});

describe('rule 5: the head word names exactly one root', () => {
  it('answers when one root carries the word and its products do too', () => {
    expect(top('test notebooks')).toMatchObject({ slug: 'journals-notebooks', rule: 'head' });
  });

  it('gives no answer when several roots carry the word', () => {
    expect(INDEX.categories.filter((c) => c.slugSet.has('signs')).length).toBe(3);
    expect(pick('neon signs')).toBeNull();
    expect(INDEX.categories.filter((c) => c.slugSet.has('sets')).length).toBe(2);
    expect(pick('boxed gift sets')).toBe('gift-sets-bundles'); // rule 2: one slug carries the tail "gift sets"
    expect(pick('travel sets')).toBeNull();
  });

  it('refuses the one root when its products do not carry the word', () => {
    // A 20-product dump with one tube / one sleeve in it.
    expect(pick('test tubes')).toBeNull();
    expect(pick('neoprene bottle sleeves')).toBeNull();
  });
});

describe('REJECTED ROAD 1: product names are evidence, never a gate', () => {
  // FIX-910 measured the gate ("a root must hold two products naming the
  // whole phrase, or there is no category"): 28 of 56 right strips lost. If
  // a change makes rule 3 a condition on the slug rules, these fail.
  it.each([
    ['embroidered koozies', 'koozies'],
    ['leather koozies', 'koozies'],
    ['sublimated koozies', 'koozies'],
    ['retro sunglasses', 'sunglasses'],
    ['safety sunglasses', 'sunglasses'],
    ['safety reminder magnets', 'magnets'],
    ['laser engraved wood ornaments', 'ornaments'],
    ['low profile trucker caps', 'caps'],
    ['test notebooks', 'journals-notebooks'],
    ['sunscreen packets', 'sunscreen'],
  ])('%s resolves to %s although no two products are named that way', (phrase, slug) => {
    expect(carryAll(slug, phrase)).toBeLessThan(MIN_EVIDENCE_PRODUCTS);
    expect(pick(phrase)).toBe(slug);
  });
});

describe('the words of a product phrase', () => {
  it('"can" is a product word for matching, and still filler for the blog topic guard', () => {
    expect(productPhraseTokens('collapsible can coolers')).toEqual(['collapsible', 'can', 'coolers']);
    expect(PRODUCT_MATCH_NON_SIGNIFICANT_WORDS.has('can')).toBe(false);
    expect(NON_SIGNIFICANT_MATCH_WORDS.has('can')).toBe(true);
    // Nothing else moved: the two sets differ by that one word.
    expect([...NON_SIGNIFICANT_MATCH_WORDS].filter((w) => !PRODUCT_MATCH_NON_SIGNIFICANT_WORDS.has(w))).toEqual(['can']);
    expect([...PRODUCT_MATCH_NON_SIGNIFICANT_WORDS].every((w) => NON_SIGNIFICANT_MATCH_WORDS.has(w))).toBe(true);
  });

  it('generic promo words and filler are dropped, order is kept, a repeated word keeps its last place', () => {
    expect(productPhraseTokens('Custom Branded Bulk Koozies')).toEqual(['koozies']);
    expect(productPhraseTokens('the best ideas')).toEqual([]);
    expect(productPhraseTokens('magnetic clips and chip clips')).toEqual(['magnetic', 'chip', 'clips']);
  });

  it('a trailing "with ..." or "for ..." is cut', () => {
    expect(productPhraseTokens('wine openers with flashlights')).toEqual(['wine', 'openers']);
    expect(productPhraseTokens('cups for gift sets')).toEqual(['cups']);
    expect(productNounOf('footballs with tee sets')).toBe('footballs');
    expect(productNounOf('glow in the dark footballs')).toBe('footballs');
    expect(productNounOf('custom branded')).toBeNull();
  });
});

describe('assembleCategoryEvidence: what a root actually shows', () => {
  const catalogue = new Map(
    [
      ['A1', 'Hard Top Cooler'],
      ['A2', 'Backpack Cooler'],
      ['B1', 'Richardson Trucker Cap'],
      ['B2', 'Foam Trucker Cap'],
      ['B3', 'Rainbow Trucker Cap'],
    ].map(([sku, name]) => [sku, { sku, name, brand: '' }]),
  );
  const bySku = (skus: readonly string[]) => skus.map((s) => catalogue.get(s)).filter((p): p is { sku: string; name: string; brand: string } => !!p);
  // caps is baked empty and dump is a full-capped-60 list: both show the lead form by the baked rule.
  const baked = (slug: string) => (slug === 'coolers' ? bySku(['A1', 'A2']) : slug === 'caps' ? [] : bySku(['A1']));
  const bakedShowsCta = (slug: string) => slug === 'caps' || slug === 'dump';
  const empty = { overrides: [], placements: [], pages: [], owned: [] };
  const names = (curation: Parameters<typeof assembleCategoryEvidence>[0]['curation'], slug = 'caps') =>
    assembleCategoryEvidence({ roots: ['coolers', 'caps', 'mats', 'dump'], baked, bakedShowsCta, bySku, curation }).find((e) => e.slug === slug)!.names;

  it('without Sanity it is the baked lists', () => {
    expect(names(null, 'coolers')).toEqual(['Hard Top Cooler', 'Backpack Cooler']);
    expect(names(null)).toEqual([]);
  });

  it("a root whose page shows the lead form gives no evidence, by the page's own precedence", () => {
    // The baked rule: a full-capped-60 list is the top 60 of a parent department.
    expect(names(null, 'dump')).toEqual([]);
    expect(names(empty, 'dump')).toEqual([]);
    // forceProducts surfaces it; adds alone do not (the page would still show the form).
    expect(names({ ...empty, overrides: [{ categorySlug: 'dump', forceProducts: true }] }, 'dump')).toEqual(['Hard Top Cooler']);
    expect(names({ ...empty, overrides: [{ categorySlug: 'dump', addedSkus: ['B1'] }] }, 'dump')).toEqual([]);
    // replaceProducts shows a grid exactly when something was added.
    expect(names({ ...empty, overrides: [{ categorySlug: 'dump', replaceProducts: true, addedSkus: ['B1'] }] }, 'dump')).toEqual(['Richardson Trucker Cap']);
    expect(names({ ...empty, overrides: [{ categorySlug: 'coolers', replaceProducts: true }] }, 'coolers')).toEqual([]);
    // forceCTA wins over everything: Patrick has said the list is off-topic.
    expect(names({ ...empty, overrides: [{ categorySlug: 'coolers', forceCTA: true, forceProducts: true }] }, 'coolers')).toEqual([]);
    // A customCategory with nothing in it shows the form too.
    expect(names({ ...empty, owned: [{ slug: 'coolers', productSkus: [] }] }, 'coolers')).toEqual([]);
  });

  it('adds join, hides win, and replaceProducts empties the baked list', () => {
    expect(names({ ...empty, overrides: [{ categorySlug: 'caps', replaceProducts: true, addedSkus: ['B1', 'B2', 'B3'], hiddenSkus: ['B3'] }] })).toEqual([
      'Richardson Trucker Cap',
      'Foam Trucker Cap',
    ]);
    expect(names({ ...empty, overrides: [{ categorySlug: 'coolers', replaceProducts: true, addedSkus: ['B1'] }] }, 'coolers')).toEqual(['Richardson Trucker Cap']);
    expect(names({ ...empty, overrides: [{ categorySlug: 'coolers', addedSkus: ['B1'], hiddenSkus: ['A2'] }] }, 'coolers')).toEqual([
      'Richardson Trucker Cap',
      'Hard Top Cooler',
    ]);
  });

  it('the newest override for a slug is the one that counts, and a facet override is not a root override', () => {
    const curation = {
      ...empty,
      overrides: [
        { categorySlug: 'coolers', addedSkus: ['B1'] },
        { categorySlug: 'coolers', addedSkus: ['B2'] },
        { categorySlug: 'coolers/color/blue', addedSkus: ['B3'] },
      ],
    };
    expect(names(curation, 'coolers')).toEqual(['Richardson Trucker Cap', 'Hard Top Cooler', 'Backpack Cooler']);
  });

  it("Patrick's own cards count: added products, placed product pages, a customCategory's list", () => {
    const curation = {
      overrides: [
        {
          categorySlug: 'caps',
          replaceProducts: true,
          added: [
            { _id: 'p1', _type: 'productPage', title: 'Custom Santa Hat', slug: 'custom-santa-hat' },
            { _id: 'p2', _type: 'productPage', title: 'No Slug Hat' },
            { _id: 'c1', _type: 'customProduct', title: 'Vendor Cap', brand: 'Acme' },
            null,
          ],
        },
      ],
      placements: [
        { sku: 'B3', addToCategories: ['caps'] },
        { sku: 'A1', removeFromCategories: ['mats'] },
      ],
      pages: [{ _id: 'p3', title: 'Placed Trucker Hat', addToCategories: ['caps'] }],
      owned: [{ slug: 'mats', productSkus: ['A1', 'A2'], custom: [{ _id: 'c9', title: 'Logo Mat' }] }],
    };
    expect(names(curation)).toEqual(['Custom Santa Hat', 'Vendor Cap Acme', 'Placed Trucker Hat', 'Rainbow Trucker Cap']);
    // The customCategory's own SKU list replaces the baked one; the placement removal still applies.
    expect(names(curation, 'mats')).toEqual(['Logo Mat', 'Backpack Cooler']);
  });
});

describe('resolveCategoryForKeywords on the real roots (slug-decided answers only)', () => {
  const roots = new Set(getAllGeneratedRootSlugs());

  it.each([
    ['koozies', 'koozies'],
    ['custom koozies', 'koozies'],
    ['branded bulk wholesale koozies', 'koozies'],
    ['water bottles', 'water-bottles'],
    ['power banks', 'power-banks-chargers'],
    ['custom beach towels', 'beach-towels'],
    ['tote bags', 'tote-bags'],
    ['notebooks and journals', 'journals-notebooks'],
    ['stress relievers', 'stress-relievers-balls'],
    ['lunch boxes', 'lunch-bags-boxes-totes'],
    ['umbrellas', 'umbrellas'],
    ['seat cushions', 'seat-cushions'],
    ['wine openers with flashlights', 'wine-openers'],
  ])('%s -> %s, as before', async (phrase, slug) => {
    expect(await resolveCategoryForKeywords(phrase)).toBe(slug);
  });

  it('generic promo words do not change the answer, and an empty phrase has none', async () => {
    expect(await resolveCategoryForKeywords('custom power banks')).toBe(await resolveCategoryForKeywords('power banks'));
    expect(await resolveCategoryForKeywords('')).toBeNull();
    expect(await resolveCategoryForKeywords('custom branded promotional')).toBeNull();
  });

  it('answers with a real root or with nothing, for any phrase', async () => {
    for (const phrase of ['collapsible can coolers', 'photo frame ornaments', 'neon signs', 'glow in the dark footballs', 'retro sunglasses', 'test tubes', 'gift cards']) {
      const slug = await resolveCategoryForKeywords(phrase);
      if (slug !== null) expect(roots.has(slug), `${phrase} -> ${slug}`).toBe(true);
    }
  });

  it('no longer sends a can cooler idea to the hard-cooler root', async () => {
    // True on the May pull and the September pull: the koozies root's own
    // baked list is can coolers, the coolers root's is not.
    expect(await resolveCategoryForKeywords('collapsible can coolers')).not.toBe('coolers');
    expect(await resolveCategoryForKeywords('can coolers')).not.toBe('coolers');
  });
});

describe('structure: one home for each rule', () => {
  it('the resolver core is pure', () => {
    const code = read('lib/ai/category-resolver.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/^import .*$/gm)).toEqual(["import { carriesToken, productPhraseTokens, significantTokens } from './match-tokens';"]);
    expect(read('lib/ai/match-tokens.ts').match(/^import .*$/gm)).toEqual(["import { PRODUCT_MATCH_NON_SIGNIFICANT_WORDS } from './brand-voice';"]);
  });

  it('the matcher and the resolver share the token rules instead of each keeping a copy', () => {
    const matcher = read('lib/ai/related-products.ts');
    expect(matcher).toContain("from './match-tokens';");
    expect(matcher).not.toMatch(/function tokenize\(/);
    expect(matcher).not.toContain('NON_SIGNIFICANT_MATCH_WORDS');
  });

  it('every caller awaits the resolver (it reads Sanity since FIX-911)', () => {
    const callers = [
      'lib/blog-automation/generate-blog-post.ts',
      'lib/blog-automation/resolve-draft-fields.ts',
      'lib/ai/generate-landing-content.ts',
      'app/api/sanity/generate-video/route.ts',
      'app/api/sanity/generate-page/route.ts',
      'app/api/sanity/generate-catalog/route.ts',
      'app/api/sanity/generate-product/route.ts',
      'app/api/sanity/generate-blog-image/route.ts',
    ];
    let calls = 0;
    for (const rel of callers) {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const found = code.match(/(await\s+)?(matcher\.)?resolveCategoryForKeywords\(/g) ?? [];
      expect(found.length, rel).toBeGreaterThan(0);
      for (const call of found) expect(call.startsWith('await'), `${rel}: ${call}`).toBe(true);
      calls += found.length;
    }
    // Nine callers (FIX-910 counted them); several ask twice (a productType, else the keywords).
    expect(calls).toBe(13);
  });

  it('no render path resolves a category: the resolver runs when content is generated', () => {
    for (const rel of ['app/products/[slug]/page.tsx', 'app/cat/[...slug]/page.tsx', 'app/blog/[slug]/page.tsx', 'app/videos/[slug]/page.tsx']) {
      expect(read(rel), rel).not.toContain('resolveCategoryForKeywords');
    }
  });
});

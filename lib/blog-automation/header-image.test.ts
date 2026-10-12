/**
 * AUTO-202: the pure rules of the blog header image: the three sources and
 * their fallback order, the library and product picks, the prompt's hard
 * rules, the check, the alt text and the summaries.
 *
 * AUTO-204: what text a picture may carry. The product's own markings pass
 * whether or not the planner predicted them; a brand name, a company name, a
 * phone number or a web address still fails, by three independent routes;
 * and the fixtures marked REAL are answers the vision model gave on the
 * measuring cups and wall clock pictures of the AUTO-204 run.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADER_IMAGE_SOURCE,
  HEADER_IMAGE_ASPECT_RATIO,
  HEADER_IMAGE_MAX_REFERENCES,
  HEADER_IMAGE_REFERENCE_WIDTH,
  HEADER_IMAGE_SIZE,
  HEADER_IMAGE_SOURCES,
  type HeaderImageLibraryEntry,
  type ImageCheck,
  type ImageTextItem,
  type ReferenceProduct,
  type ScenePlan,
  FORBIDDEN_TEXT_WORDS,
  IMAGE_CHECK_READS,
  UNREADABLE_IMAGE_CHECK,
  buildHeaderImagePrompt,
  buildImageCheckPrompt,
  buildScenePlanPrompt,
  effectiveHeaderImageSource,
  firstProductImage,
  geigerReferenceUrl,
  headerImageAlt,
  headerImageFilename,
  headerImageSourceOf,
  headerImageSummary,
  headerImageWhat,
  headerImageWhy,
  imageCheckProblem,
  imageValueFor,
  looksLikeContactDetail,
  parseImageCheck,
  parseScenePlan,
  pickLibraryImage,
  pickReferenceProducts,
  productMatchesTopic,
  scrubProductText,
  topicProductWords,
  worstImageCheckProblem,
} from './header-image';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const geiger = (n: number) => `https://imgsirv.geiger.com/master/10${n}/web/10${n}_1.jpg?format=webp&thumbnail=275&w=275&h=275`;
const products: ReferenceProduct[] = [
  { sku: '501003', name: 'Reflective Safety Drawstring Backpack', imageUrl: geiger(1003) },
  { sku: '501004', name: 'No photo', imageUrl: null },
  { sku: '501005', name: 'Other host', imageUrl: 'https://cdn.sanity.io/images/x/production/a.jpg' },
  { sku: '501006', name: 'Insulated Bottle', imageUrl: geiger(1006) },
  { sku: '501006', name: 'Insulated Bottle again', imageUrl: geiger(1006) },
  { sku: '501007', name: 'Canvas Tote', imageUrl: geiger(1007) },
  { sku: '501008', name: 'Stress Ball', imageUrl: geiger(1008) },
  { sku: '501009', name: 'Fifth', imageUrl: geiger(1009) },
];

describe('the source setting', () => {
  it('reads the three values and nothing else', () => {
    expect(HEADER_IMAGE_SOURCES).toEqual(['ai', 'library', 'product']);
    expect(headerImageSourceOf('ai')).toBe('ai');
    expect(headerImageSourceOf('library')).toBe('library');
    expect(headerImageSourceOf('product')).toBe('product');
    expect(headerImageSourceOf('')).toBeNull();
    expect(headerImageSourceOf('AI')).toBeNull();
    expect(headerImageSourceOf(undefined)).toBeNull();
  });

  it('the post override wins, then the site default, then AI generated (Patrick\'s default)', () => {
    expect(DEFAULT_HEADER_IMAGE_SOURCE).toBe('ai');
    expect(effectiveHeaderImageSource('library', 'ai')).toBe('library');
    expect(effectiveHeaderImageSource(null, 'product')).toBe('product');
    expect(effectiveHeaderImageSource(undefined, undefined)).toBe('ai');
    expect(effectiveHeaderImageSource('nonsense', 'library')).toBe('library');
    expect(effectiveHeaderImageSource('', '')).toBe('ai');
  });

  it('both schemas mirror the three values inline (the Studio bundle cannot import the list)', () => {
    for (const file of ['sanity/schemas/singletons/global-settings.ts', 'sanity/schemas/documents/blog-post.ts']) {
      const src = read(file);
      for (const v of HEADER_IMAGE_SOURCES) expect(src, `${file} ${v}`).toContain(`value: '${v}'`);
      // No initialValue on the source fields: blank must keep meaning "the default".
      const field = src.slice(src.indexOf("name: 'headerImageSource'"), src.indexOf("name: 'headerImageSource'") + 1500);
      expect(field).not.toContain('initialValue');
    }
  });
});

describe('the library', () => {
  const library: HeaderImageLibraryEntry[] = [
    { rootSlug: 'caps', assetRef: 'image-caps-1600x900-jpg', alt: 'Caps' },
    { rootSlug: 'pens', assetRef: 'image-pens-1600x900-jpg', alt: null },
    { rootSlug: null, assetRef: 'image-any-1600x900-jpg', alt: 'Any' },
  ];

  it('matches the post\'s roots in the post\'s order, then the any-post picture, then nothing', () => {
    expect(pickLibraryImage(library, ['pens', 'caps'])?.rootSlug).toBe('pens');
    expect(pickLibraryImage(library, ['tote-bags'])?.rootSlug).toBeNull();
    expect(pickLibraryImage(library.slice(0, 2), ['tote-bags'])).toBeNull();
    expect(pickLibraryImage([], ['caps'])).toBeNull();
  });

  it('writes the image value with the alt only when there is one', () => {
    expect(imageValueFor('image-x', 'Alt')).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: 'image-x' }, alt: 'Alt' });
    expect(imageValueFor('image-x', '  ')).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: 'image-x' } });
  });
});

describe('the reference photos and the product fallback', () => {
  it('takes the first four Geiger photos, each SKU once, skipping other hosts and missing photos', () => {
    const picked = pickReferenceProducts(products);
    expect(picked.map((p) => p.sku)).toEqual(['501003', '501006', '501007', '501008']);
    expect(HEADER_IMAGE_MAX_REFERENCES).toBe(4);
  });

  it('with a topic, only products whose name carries a topic word are references (the pedometers lesson)', () => {
    // The real second proof draft: a "custom pedometers" post whose strips were clips.
    const clips: ReferenceProduct[] = [
      { sku: '505494', name: 'Ad Clip', imageUrl: geiger(5494) },
      { sku: '505516', name: 'Oval Clip', imageUrl: geiger(5516) },
      { sku: '505511', name: 'House Clip', imageUrl: geiger(5511) },
      { sku: '519201', name: 'Running Belt Fanny Pack', imageUrl: geiger(9201) },
    ];
    expect(pickReferenceProducts(clips, 4, 'custom pedometers')).toEqual([]);
    // The real first and third drafts: coolers and foam footballs match on their own word.
    const coolers: ReferenceProduct[] = [
      { sku: '525375', name: 'Coleman 9-Can Soft-Sided Cooler With Removable Liner', imageUrl: geiger(5375) },
      { sku: '515039', name: 'Cooler Caddy Jr', imageUrl: geiger(5039) },
      { sku: '519201', name: 'Running Belt Fanny Pack', imageUrl: geiger(9201) },
      { sku: '527613', name: 'Backpack Cooler', imageUrl: geiger(7613) },
    ];
    expect(pickReferenceProducts(coolers, 4, 'custom coolers with logo').map((p) => p.sku)).toEqual(['525375', '515039', '527613']);
    expect(pickReferenceProducts([{ sku: '508673', name: '7" Foam Football', imageUrl: geiger(8673) }], 4, 'foam footballs').map((p) => p.sku)).toEqual(['508673']);
    // Promo words and filler never count as topic words; a topic made only of them matches everything.
    expect(topicProductWords('custom promotional bulk ideas')).toEqual([]);
    expect(pickReferenceProducts(clips, 4, 'custom promotional bulk ideas')).toHaveLength(4);
    expect(topicProductWords('custom pedometers')).toEqual(['pedometer']);
    expect(topicProductWords('custom coolers with logo')).toEqual(['cooler']);
    expect(productMatchesTopic('Backpack Cooler', ['cooler'])).toBe(true);
    expect(productMatchesTopic('Ad Clip', ['pedometer'])).toBe(false);
  });

  it('the first product photo is a hot link with the product name as alt, under the same topic rule', () => {
    expect(firstProductImage(products)).toEqual({ url: geiger(1003), alt: 'Reflective Safety Drawstring Backpack' });
    expect(firstProductImage([products[1], products[2]])).toBeNull();
    expect(firstProductImage([])).toBeNull();
    expect(firstProductImage(products, 'custom tote bags')).toEqual({ url: geiger(1007), alt: 'Canvas Tote' });
    expect(firstProductImage(products, 'custom pedometers')).toBeNull();
  });

  it('a reference is fetched from Geiger at the modest width, and never from any other host', () => {
    expect(geigerReferenceUrl(geiger(1003))).toBe(
      `https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=${HEADER_IMAGE_REFERENCE_WIDTH}&w=${HEADER_IMAGE_REFERENCE_WIDTH}&h=${HEADER_IMAGE_REFERENCE_WIDTH}`,
    );
    expect(geigerReferenceUrl('https://cdn.sanity.io/images/x/production/a.jpg')).toBeNull();
    expect(geigerReferenceUrl('http://imgsirv.geiger.com/a.jpg')).toBeNull();
    expect(geigerReferenceUrl('https://imgsirv.geiger.com.evil.test/a.jpg')).toBeNull();
    expect(geigerReferenceUrl(null)).toBeNull();
  });
});

describe('the prompt', () => {
  const prompt = buildHeaderImagePrompt({
    title: '9 Smart Ways Businesses Use Custom Tote Bags',
    topic: 'custom tote bags',
    productNames: ['Canvas Tote', 'Insulated Bottle'],
  });

  it('names the title, the topic, the buyers and every reference product', () => {
    expect(prompt).toContain('"9 Smart Ways Businesses Use Custom Tote Bags"');
    expect(prompt).toContain('about custom tote bags for organizations that order promotional products in bulk');
    expect(prompt).toContain('marketing directors, HR directors, safety managers and business owners');
    expect(prompt).toContain('Canvas Tote; Insulated Bottle');
    expect(prompt).toContain('(16:9)');
  });

  it('states the hard rules: no words when nothing was planned, no logos or brand names including background devices, no products beyond the references', () => {
    expect(prompt).toMatch(/^- No words anywhere in the image\./m);
    // AUTO-204: a product that carries markings by nature still gets them, even with no plan.
    expect(prompt).toContain('If this kind of product carries functional markings by its nature (a measuring scale, numerals, units, a dial face), draw only those, plain and generic');
    expect(prompt).toContain('no word, name or message printed or engraved on the product as decoration');
    expect(prompt).toContain('No laptops, phones, tablets or monitors in the scene unless the product is used with one');
    expect(prompt).toMatch(/No logos, brand marks, trademarks, brand names, company names, phone numbers, web addresses or slogans/);
    expect(prompt).toContain('laptops, phones, tablets, cups, bottles, bags, shoes or clothing');
    expect(prompt).toContain('Show only products of the kinds in the reference photos');
    expect(prompt).toContain('Do not add other promotional products');
    // With no plan the setting is AUTO-202's generic one.
    expect(prompt).toContain('blank and unbranded, arranged in a clean, realistic setting');
  });

  describe('with a scene plan (AUTO-203)', () => {
    const scene: ScenePlan = {
      surface: 'the door of a stainless steel refrigerator',
      setting: 'a small office break room',
      people: 'none',
      around: ['a coffee mug', 'a notepad'],
      productText: 'a calendar grid with the twelve months and their dates',
      avoid: 'stuck to a wooden desk or lying flat on a table',
    };
    const planned = buildHeaderImagePrompt({
      title: 'Promotional Calendar Magnets: A Buyer\'s Guide',
      topic: 'promotional calendar magnets',
      productNames: ['Business Card Magnet Calendar'],
      scene,
    });

    it('puts the product where the plan says, names what is around it, and forbids the impossible placement', () => {
      expect(planned).toContain('in use, where such a product really lives: the door of a stainless steel refrigerator, in a small office break room.');
      expect(planned).toContain('Around it: a coffee mug, a notepad.');
      expect(planned).toContain('Physically wrong, and not to be shown: stuck to a wooden desk or lying flat on a table.');
      expect(planned).not.toContain('arranged in a clean, realistic setting');
    });

    it("allows ONLY the product's own markings, as generic placeholders, and still forbids every brand element and every other word", () => {
      expect(planned).toContain("The ONLY text allowed in the image is this product's own functional markings, the kind in the reference photos: a calendar grid with the twelve months and their dates.");
      expect(planned).toContain('never a brand name, a company name, a phone number, a web address, a slogan or a claim');
      expect(planned).toContain('No other writing anywhere: no labels, signs, name plates, price tags, titles on books or magazines, screens with writing, writing in the background');
      expect(planned).not.toMatch(/^- No words anywhere/m);
      expect(planned).toMatch(/No logos, brand marks, trademarks, brand names, company names, phone numbers, web addresses or slogans/);
    });

    it('a plan whose product carries no text asks for no words, and still lets a product draw the markings it has by nature', () => {
      const p = buildHeaderImagePrompt({ title: 'T', topic: 'custom koozies', productNames: [], scene: { ...scene, productText: '' } });
      expect(p).toMatch(/^- No words anywhere/m);
      expect(p).toContain('draw only those, plain and generic; add no other letters or numbers');
      expect(p).toContain('where such a product really lives');
    });

    it('the retry names the problem and keeps the text rule the picture was drawn under', () => {
      const p = buildHeaderImagePrompt({ title: 'T', topic: 't', productNames: [], scene, previousProblem: 'a brand, company name or contact detail in text ("Acme Plumbing 555-0100")' });
      expect(p).toContain('rejected because it contained a brand, company name or contact detail in text ("Acme Plumbing 555-0100")');
      expect(p).toContain("no writing except the product's own functional markings");
      const q = buildHeaderImagePrompt({ title: 'T', topic: 't', productNames: [], previousProblem: 'words on a sign, a label, a cover or a screen ("OPEN" on a sign)' });
      expect(q).toContain("no writing except the product's own functional markings");
    });
  });

  it('with no reference photo it describes the item the title names, and still forbids inventing', () => {
    const p = buildHeaderImagePrompt({ title: 'Custom Pens', topic: 'custom pens', productNames: [] });
    expect(p).toContain('Show the kind of item the title names');
    expect(p).toContain('Show only the kind of product the title names');
    expect(p).not.toContain('reference photos');
  });

  it('a retry names what the check found', () => {
    const p = buildHeaderImagePrompt({ title: 'T', topic: 't', productNames: [], previousProblem: 'a logo or brand mark (Apple)' });
    expect(p).toContain('The previous attempt was rejected because it contained a logo or brand mark (Apple)');
  });

  it('the picture is wide and 1K', () => {
    expect(HEADER_IMAGE_ASPECT_RATIO).toBe('16:9');
    expect(HEADER_IMAGE_SIZE).toBe('1K');
  });
});

describe('alt text and filename', () => {
  it('says what was asked for and that it is illustrative', () => {
    expect(headerImageAlt('custom tote bags')).toBe('Custom tote bags shown blank and unbranded in a business setting (illustrative image)');
    expect(headerImageAlt('  ')).toBe('Promotional products shown blank and unbranded in a business setting (illustrative image)');
  });

  it('names the post and the attempt', () => {
    expect(headerImageFilename('custom-tote-bags-for-events', 1)).toBe('custom-tote-bags-for-events-header.jpg');
    expect(headerImageFilename('custom-tote-bags-for-events', 2)).toBe('custom-tote-bags-for-events-header-2.jpg');
    expect(headerImageFilename('', 1)).toBe('blog-header-header.jpg');
  });
});

const NONE: ImageCheck = {
  texts: [],
  listed: true,
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  impossible: false,
  impossibleSeen: '',
};
const item = (text: string, where: string, onProduct: boolean, kind: ImageTextItem['kind']): ImageTextItem => ({ text, where, onProduct, kind });
const withTexts = (...texts: ImageTextItem[]): ImageCheck => ({ ...NONE, texts });

/** REAL: the vision model's answer on the measuring cups picture of the AUTO-204 run (old-cups-2, read 1). */
const REAL_MEASURING_CUPS = {
  texts: [
    { text: '1 Cup', where: 'green measuring spoon handle', onProduct: true, kind: 'marking' },
    { text: '1 Tbsp', where: 'green measuring spoon handle', onProduct: true, kind: 'marking' },
    { text: '1/2 Tbsp', where: 'green measuring spoon handle', onProduct: true, kind: 'marking' },
    { text: '1/4 Tbsp', where: 'green measuring spoon handle', onProduct: true, kind: 'marking' },
    { text: '400\n300\n200\n100', where: 'one-cup measuring cup', onProduct: true, kind: 'marking' },
    { text: 'CUP\n2\n1\n3/4\n1/2\n1/4', where: 'one-cup measuring cup', onProduct: true, kind: 'marking' },
  ],
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  impossible: false,
  impossibleSeen: '',
};
/** REAL: the answer on the wall clock picture the OLD check passed (old-clocks-1, read 3): an Apple logo on a laptop and an award engraved on a desk clock. */
const REAL_WALL_CLOCKS = {
  texts: [
    { text: '12, 3, 6, 9 and other numbers', where: 'giant wall clock', onProduct: true, kind: 'marking' },
    { text: 'EMPLOYEE OF THE MONTH', where: 'Somerset Clock plaque', onProduct: true, kind: 'display' },
    { text: 'Name', where: 'Somerset Clock plaque', onProduct: true, kind: 'display' },
    { text: '12, 3, 6, 9', where: 'Somerset Clock dial', onProduct: true, kind: 'marking' },
    { text: '12, 3, 6, 9', where: 'Oslo Clock dial', onProduct: true, kind: 'marking' },
    { text: 'Roman numerals (XII, III, VI, IX)', where: 'Cronus Wood Clock dial', onProduct: true, kind: 'marking' },
  ],
  logo: true,
  logoSeen: 'Apple logo on laptop',
  brandText: false,
  brandTextSeen: '',
  impossible: false,
  impossibleSeen: '',
};
/** REAL: the answer on the deliberate brand test (a calendar magnet drawn with "ACME PLUMBING 555-0100" across it). */
const REAL_BRAND_TEST = {
  texts: [
    { text: 'ACME PLUMBING 555-0100', where: 'promotional calendar magnet', onProduct: true, kind: 'brand' },
    { text: 'JANUARY FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST SEPTEMBER OCTOBER NOVEMBER DECEMBER M T W T F S S 1 2 3 4 5 6 7', where: 'promotional calendar magnet', onProduct: true, kind: 'marking' },
  ],
  logo: false,
  logoSeen: '',
  brandText: true,
  brandTextSeen: 'ACME PLUMBING 555-0100',
  impossible: false,
  impossibleSeen: '',
};

describe('the scene planner (AUTO-203)', () => {
  it('asks for a physically possible scene, names the products, and states the text rule', () => {
    const { system, user } = buildScenePlanPrompt({ title: 'Promotional Calendar Magnets: A Buyer\'s Guide', topic: 'promotional calendar magnets', productNames: ['Business Card Magnet Calendar', 'House Shape Calendar Magnet'] });
    expect(system).toContain('a magnet is on a refrigerator or a filing cabinet, a koozie is around a can');
    expect(system).toContain('ONE JSON object');
    expect(user).toContain('The actual products shown in the post: Business Card Magnet Calendar; House Shape Calendar Magnet.');
    expect(user).toContain('physically possible for THIS product');
    expect(user).toContain('No brand name, logo, wordmark, company name, phone number, web address or slogan anywhere');
    expect(user).toContain('productText is the functional markings this kind of product carries by its nature');
    expect(user).toContain('a measuring scale with its numbers and units, the numerals of a clock face');
    // AUTO-204: the props must not be things that carry writing, and no device unless the product needs one.
    expect(user).toContain('No signs, screens, name plates, awards, labelled packaging or book and magazine covers');
    expect(user).toContain('No laptops, phones or tablets unless this product is used with one.');
    expect(user).toContain('"avoid"');
    expect(buildScenePlanPrompt({ title: 'T', topic: 'custom pens', productNames: [] }).user).toContain('No product list is available');
  });

  it('reads the plan defensively, capping lengths and dropping brand words from what is around the product', () => {
    const plan = parseScenePlan({
      surface: '  the door of a   stainless steel refrigerator ',
      setting: 'a break room',
      people: '',
      around: ['a coffee mug', 'a laptop with the company logo', 'a notepad', 'a plant', 'a fifth thing'],
      productText: 'a 12-month calendar grid',
      avoid: 'lying flat on a desk',
    });
    expect(plan).toEqual({
      surface: 'the door of a stainless steel refrigerator',
      setting: 'a break room',
      people: 'none',
      around: ['a coffee mug', 'a notepad', 'a plant', 'a fifth thing'],
      productText: 'a 12-month calendar grid',
      avoid: 'lying flat on a desk',
    });
    expect(parseScenePlan({ around: 'a mug, a pen' })).toBeNull();
    expect(parseScenePlan('nonsense')).toBeNull();
    expect(parseScenePlan({ surface: 'a counter', around: 'a mug, a pen' })?.around).toEqual(['a mug', 'a pen']);
  });

  it("scrubs a brand, a company name, a phone number or a web address out of the planner's product text (the 2026-10-08 probe volunteered all three)", () => {
    expect(scrubProductText('a Year-at-a-Glance calendar grid showing the 12 months of the year, alongside a small business logo and contact phone number at the bottom')).toBe(
      'a Year-at-a-Glance calendar grid showing the 12 months of the year',
    );
    expect(scrubProductText('a clear 12-month calendar grid for the upcoming year with bold headers and a sample small business logo at the top')).toBe('a clear 12-month calendar grid for the upcoming year with bold headers');
    expect(scrubProductText('the company name and phone number, plus a calendar')).toBe('');
    expect(scrubProductText('none')).toBe('');
    expect(scrubProductText('No text')).toBe('');
    expect(scrubProductText('inch and centimetre markings along the edge')).toBe('inch and centimetre markings along the edge');
    expect(scrubProductText('a website URL printed under the grid')).toBe('');
    expect(scrubProductText('ruled lines, a date line at the top of each page')).toBe('ruled lines, a date line at the top of each page');
  });

  it("keeps a product's own numbers and names (AUTO-204): the bare words 'number' and 'name' are not forbidden", () => {
    expect(FORBIDDEN_TEXT_WORDS).not.toContain('number');
    expect(FORBIDDEN_TEXT_WORDS).not.toContain('name');
    // The planner's real answers on the AUTO-204 run, every one of which the old scrubber cut.
    for (const kept of [
      'graduated measurement lines and capacity numbers',
      'measurement lines and capacity numbers in cups and milliliters',
      'inch and foot measurement numbers and tick marks along the blade',
      'standard imperial and metric tick marks and numbers from 0 to 12 inches',
      'temperature scale markings with Fahrenheit and Celsius numbers',
      'standard 12-hour clock face numbers',
      // The planner prompt's own example before AUTO-204, which the old scrubber cut to nothing.
      'the numbers on a ruler',
      'a calendar grid with month names and dates',
      'the names of the days of the week',
    ]) {
      expect(scrubProductText(kept), kept).toBe(kept);
    }
  });

  it('still cuts every contact, company and brand sense that "number" and "name" used to catch', () => {
    expect(scrubProductText('measurement lines and a phone number')).toBe('measurement lines');
    expect(scrubProductText('a calendar grid, a contact number')).toBe('a calendar grid');
    expect(scrubProductText('capacity numbers and a toll-free number')).toBe('capacity numbers');
    expect(scrubProductText('a scale with the store name')).toBe('a scale');
    expect(scrubProductText("the customer's name and a calendar")).toBe('');
    expect(scrubProductText('your name above the calendar grid')).toBe('');
    expect(scrubProductText('a business name and month names')).toBe('');
    expect(scrubProductText('a price and a scale')).toBe('');
    expect(scrubProductText('a fax line')).toBe('');
  });
});

describe('the check', () => {
  it('lists every piece of text with its object and its kind, and asks about logos, brand text and an impossible placement, JSON only', () => {
    const { system, user } = buildImageCheckPrompt({ topic: 'promotional measuring cups', productNames: ["Cook's Choice One-Cup Measuring Cup", 'Measuring Spoon Set'], productText: 'graduated measurement lines' });
    expect(system).toContain('ONE JSON object');
    expect(user).toContain('List every piece of READABLE text');
    for (const kind of ['"brand"', '"marking"', '"page"', '"display"']) expect(user).toContain(kind);
    for (const key of ['"texts"', '"onProduct"', '"logo"', '"brandText"', '"impossible"']) expect(user).toContain(key);
    // It knows what "the product" is, so text on any of the items is on the product.
    expect(user).toContain("This picture is about promotional measuring cups (the products shown are like: Cook's Choice One-Cup Measuring Cup; Measuring Spoon Set). Every item of that kind in the picture is \"the product\".");
    // The plan is a guide, never the complete list (the fault behind Ali's refusals).
    expect(user).toContain('The product is expected to carry: graduated measurement lines. That is a guide, not the complete list');
    // The old question that was answered with the product's own markings is gone.
    expect(user).not.toContain('No text was requested anywhere');
    expect(user).not.toContain('The product itself may carry');
    expect(user).not.toContain('textOffProduct');
  });

  it('asks the logo, brand and impossible questions WORD FOR WORD as AUTO-203 did: the forbidden list did not move', () => {
    const { user } = buildImageCheckPrompt();
    expect(user).toContain(
      '2. Is there any LOGO, brand mark, trademark or recognisable brand design anywhere, including on laptops, phones, cups, bottles, bags, shoes or clothing in the background? A blank imprint area or an abstract shape with no brand meaning is not a logo.',
    );
    expect(user).toContain(
      '3. Does any text read as a BRAND NAME, a company or business name, a phone number, a web address, an email address, a slogan or a marketing claim, real or invented? Generic placeholder content (month names, dates, numbers on a ruler, lines on a page) is not a brand.',
    );
    expect(user).toContain(
      '4. Is the main product somewhere it could not physically be, or used in a way it could not be used (a magnet stuck to wood or glass, a can cooler standing beside the can instead of around it, a wall clock lying on a table as if it were a plate)?',
    );
    // With no context at all it still says markings may exist, and never that no text was allowed.
    expect(user).toContain('The product may carry functional markings of its own even though none were described in advance.');
  });

  it('reads the answer defensively, and FAILS CLOSED on the list', () => {
    expect(parseImageCheck({ texts: [], logo: 'false', logoSeen: '' })).toEqual(NONE);
    expect(parseImageCheck({ texts: [{ text: ' SALE ', where: 'a sign', onProduct: 'false', kind: 'DISPLAY' }], logo: 'true', logoSeen: 'Apple', brandText: 'yes', brandTextSeen: 'Acme', impossible: true, impossibleSeen: 'magnet on wood' })).toEqual({
      texts: [item('SALE', 'a sign', false, 'display')],
      listed: true,
      logo: true,
      logoSeen: 'Apple',
      brandText: true,
      brandTextSeen: 'Acme',
      impossible: true,
      impossibleSeen: 'magnet on wood',
    });
    // No list at all: not "nothing seen" but "not listed", which refuses.
    for (const bad of ['nonsense', null, {}, { texts: 'none' }, { logo: false }]) {
      expect(parseImageCheck(bad).listed, JSON.stringify(bad)).toBe(false);
      expect(imageCheckProblem(parseImageCheck(bad)), JSON.stringify(bad)).toBe('text the check could not account for');
    }
    expect(imageCheckProblem(UNREADABLE_IMAGE_CHECK)).toBe('text the check could not account for');
    // A kind that is not one of the four reads as display, the refused kind; a missing onProduct reads as off the product.
    const odd = parseImageCheck({ texts: [{ text: 'HELLO', where: 'a mug', kind: 'decoration' }] });
    expect(odd.texts).toEqual([item('HELLO', 'a mug', false, 'display')]);
    expect(imageCheckProblem(odd)).toBe('words on a sign, a label, a cover or a screen ("HELLO" on a mug)');
    // Empty entries are dropped, and a runaway list is cut.
    expect(parseImageCheck({ texts: [null, {}, { text: '', where: '' }, 'x'] }).texts).toEqual([]);
    expect(parseImageCheck({ texts: Array.from({ length: 50 }, (_, i) => ({ text: `${i}`, where: 'a scale', onProduct: true, kind: 'marking' })) }).texts).toHaveLength(20);
  });

  it("the product's own markings PASS, with or without a plan, on the product or beside it (AUTO-204)", () => {
    expect(imageCheckProblem(NONE)).toBeNull();
    // Ali's measuring cups: the real answer the model gave.
    expect(imageCheckProblem(parseImageCheck(REAL_MEASURING_CUPS))).toBeNull();
    // One of each thing the brief named.
    for (const marking of [
      item('1 CUP 3/4 1/2 1/4 250 ml', 'the measuring cups', true, 'marking'),
      item('12 3 6 9', 'the wall clock dial', true, 'marking'),
      item('1 2 3 4 5 6 inches', 'the ruler', true, 'marking'),
      item('JANUARY 2027 S M T W T F S 1 2 3', 'the calendar magnet', true, 'marking'),
      item('MON TUE WED THU FRI SAT SUN', 'the pill box', true, 'marking'),
      item('98.6', 'the thermometer display', true, 'marking'),
      // A marking on something that is not the product is still a marking.
      item('12 3 6 9', 'a clock on the back wall', false, 'marking'),
    ]) {
      expect(imageCheckProblem(withTexts(marking)), marking.text).toBeNull();
    }
    // There is no "what the planner allowed" argument: the verdict takes the check alone.
    expect(imageCheckProblem.length).toBe(1);
  });

  it('small page text on a prop passes; display text does not, on the product or off it', () => {
    // The cookbook of both of Ali's refusals.
    expect(imageCheckProblem(withTexts(item('lines of recipe text', 'an open cookbook', false, 'page'), item('500 400 300', 'the measuring cup', true, 'marking')))).toBeNull();
    expect(imageCheckProblem(withTexts(item('handwritten notes', 'a notepad', false, 'page')))).toBeNull();
    // Display text: where a name sits.
    expect(imageCheckProblem(withTexts(item('OPEN', 'a wall sign', false, 'display')))).toBe('words on a sign, a label, a cover or a screen ("OPEN" on a wall sign)');
    expect(imageCheckProblem(withTexts(item('The Joy of Baking', 'a cookbook cover', false, 'display')))).toBe('words on a sign, a label, a cover or a screen ("The Joy of Baking" on a cookbook cover)');
    expect(imageCheckProblem(withTexts(item('COFFEE', 'the mug', true, 'display')))).toBe('words printed on the product that are not its own markings ("COFFEE" on the mug)');
    // Both at once are both said.
    expect(imageCheckProblem(withTexts(item('TEAM', 'the cap', true, 'display'), item('SALE', 'a banner', false, 'display')))).toBe(
      'words printed on the product that are not its own markings ("TEAM" on the cap) and words on a sign, a label, a cover or a screen ("SALE" on a banner)',
    );
  });

  it('the wall clock picture the old check passed is refused: the Apple logo and the engraved award (REAL answer)', () => {
    expect(imageCheckProblem(parseImageCheck(REAL_WALL_CLOCKS))).toBe(
      'a logo or brand mark (Apple logo on laptop) and words printed on the product that are not its own markings ("EMPLOYEE OF THE MONTH" on Somerset Clock plaque, "Name" on Somerset Clock plaque)',
    );
  });

  it('a brand name, a company name or a contact detail is refused THREE independent ways', () => {
    // 1) The model's own yes to the brand question (AUTO-203's field), even with every entry called a marking.
    expect(imageCheckProblem({ ...withTexts(item('JANUARY 1 2 3', 'the magnet', true, 'marking')), brandText: true, brandTextSeen: 'Acme Plumbing 555-0100' })).toBe(
      'a brand, company name or contact detail in text ("Acme Plumbing 555-0100")',
    );
    // 2) An entry the model listed as a brand, even with the brand question answered no.
    expect(imageCheckProblem(withTexts(item('ACME PLUMBING', 'the magnet', true, 'brand')))).toBe('a brand, company name or contact detail in text ("ACME PLUMBING" on the magnet)');
    // 3) A phone number or a web address found in CODE, whatever kind the model gave the entry.
    expect(imageCheckProblem(withTexts(item('JANUARY 555-0100 FEBRUARY', 'the magnet', true, 'marking')))).toBe(
      'a brand, company name or contact detail in text ("JANUARY 555-0100 FEBRUARY" on the magnet)',
    );
    expect(imageCheckProblem(withTexts(item('www.acmeplumbing.com', 'an open cookbook', false, 'page')))).toContain('a brand, company name or contact detail in text');
    // The deliberate test of AUTO-203, the real answer: refused, by all three at once.
    expect(imageCheckProblem(parseImageCheck(REAL_BRAND_TEST))).toBe('a brand, company name or contact detail in text ("ACME PLUMBING 555-0100")');
    // A brand is refused wherever it is: the product, a prop, a page.
    for (const where of [true, false]) expect(imageCheckProblem(withTexts(item('Nike', 'a shoe', where, 'brand')))).toContain('a brand, company name or contact detail');
  });

  it('a logo and an impossible placement are refused as before, in the same words', () => {
    expect(imageCheckProblem({ ...NONE, logo: true, logoSeen: 'Apple' })).toBe('a logo or brand mark (Apple)');
    expect(imageCheckProblem({ ...NONE, logo: true })).toBe('a logo or brand mark');
    expect(imageCheckProblem({ ...NONE, impossible: true, impossibleSeen: 'the magnet is on a wooden desk' })).toBe('the product somewhere it could not be (the magnet is on a wooden desk)');
    expect(imageCheckProblem({ ...NONE, impossible: true })).toBe('the product somewhere it could not be');
  });

  it('finds a phone number, a web address or an email in code, and nothing in a scale, a date or a year', () => {
    for (const hit of ['555-0100', 'ACME PLUMBING 555-0100', '(850) 200-4020', '800-773-9472', '850.200.4020', '1-800-FLOWERS', 'www.example.com', 'Freevect.io', 'https://x.org/y', 'cs@perfectimprints.com']) {
      expect(looksLikeContactDetail(hit), hit).toBe(true);
    }
    for (const miss of ['500 400 300 200 100', '1 Cup, 1/2 Cup, 1/4 Cup', '12, 3, 6, 9', 'JANUARY 2027 1 2 3 4 5 6 7', '0 to 500 degrees', '1 2 3 4 5 6 7 8', 'MON TUE WED', '16 oz', '250 ml', 'Roman numerals (XII, III, VI, IX)']) {
      expect(looksLikeContactDetail(miss), miss).toBe(false);
    }
  });

  it('several reads are judged together and the worst answer wins', () => {
    expect(IMAGE_CHECK_READS).toBeGreaterThanOrEqual(2);
    const passes = parseImageCheck(REAL_MEASURING_CUPS);
    const refuses = parseImageCheck(REAL_WALL_CLOCKS);
    expect(worstImageCheckProblem([passes, passes])).toBeNull();
    // The read the old chain made passed this picture; the next read saw the logo. Either order refuses.
    expect(worstImageCheckProblem([passes, refuses])).toContain('a logo or brand mark (Apple logo on laptop)');
    expect(worstImageCheckProblem([refuses, passes])).toContain('a logo or brand mark (Apple logo on laptop)');
    // An unavailable read is left out; no read at all is not a refusal here (the chain notes it).
    expect(worstImageCheckProblem([null, passes])).toBeNull();
    expect(worstImageCheckProblem([null, refuses])).toContain('a logo or brand mark');
    expect(worstImageCheckProblem([null, null])).toBeNull();
  });
});

describe('the summary', () => {
  const image = imageValueFor('image-x', 'alt');
  it('says where the picture came from, then why in sentences, with nothing in brackets and nothing twice', () => {
    expect(headerImageSummary({ kind: 'asset', source: 'ai', image, notes: [] })).toBe("Header image: generated by the AI from the post's product photos.");
    expect(headerImageSummary({ kind: 'asset', source: 'library', image, notes: ['the image model failed: x'] })).toBe('Header image: a picture from the header image library. The image model failed: x.');
    expect(headerImageSummary({ kind: 'url', source: 'product', url: 'u', alt: 'a', notes: [] })).toBe("Header image: the post's first product photo, shown from Geiger's image server.");
    expect(headerImageSummary({ kind: 'none', notes: ['a', 'b'] })).toBe('Header image: none. A. B. Upload one, or press Generate header image on the draft.');
  });

  it("Ali's notice (AUTO-204): the refusal is said once, in the summary, and the two halves are available apart", () => {
    const notes = [
      'both generated pictures were refused, so neither was used: the first showed words on a sign, a label, a cover or a screen ("The Joy of Baking" on a cookbook cover); the second showed a logo or brand mark (Apple logo on laptop)',
      'the header image library is empty',
    ];
    const outcome = { kind: 'url' as const, source: 'product' as const, url: 'u', alt: 'a', notes };
    const summary = headerImageSummary(outcome);
    expect(summary).toBe(
      'Header image: the post\'s first product photo, shown from Geiger\'s image server. Both generated pictures were refused, so neither was used: the first showed words on a sign, a label, a cover or a screen ("The Joy of Baking" on a cookbook cover); the second showed a logo or brand mark (Apple logo on laptop). The header image library is empty.',
    );
    expect(summary.match(/Both generated pictures were refused/g)).toHaveLength(1);
    expect(headerImageWhat(outcome)).toBe("the post's first product photo, shown from Geiger's image server");
    expect(headerImageWhy(outcome)).toBe(summary.slice(summary.indexOf('Both')));
    // Brackets never nest more than one deep: the reasons are not wrapped in a bracket of their own.
    let depth = 0;
    let deepest = 0;
    for (const ch of summary) {
      if (ch === '(') deepest = Math.max(deepest, (depth += 1));
      if (ch === ')') depth -= 1;
    }
    expect(deepest).toBe(1);
    expect(headerImageWhy({ notes: [] })).toBe('');
    expect(headerImageWhy({ notes: ['Already a sentence.', ' needs a stop '] })).toBe('Already a sentence. Needs a stop.');
  });
});

describe('structure', () => {
  it('this module imports nothing but the pure Geiger size rewrite and the shared word lists', () => {
    const imports = read('lib/blog-automation/header-image.ts').match(/^import .*$/gm) ?? [];
    expect(imports).toEqual([
      "import { geigerImageVariant } from '../blog/header-image';",
      "import { NEAR_GENERIC_WORDS, NON_SIGNIFICANT_MATCH_WORDS } from '../ai/brand-voice';",
    ]);
  });

  it('the image model is named in lib/ai/gemini.ts and nowhere else', () => {
    const dirs = ['app', 'components', 'lib', 'sanity', 'scripts'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (name === 'node_modules' || name.startsWith('.')) continue;
        let isDir = false;
        try {
          isDir = readdirSync(join(ROOT, rel)).length >= 0;
        } catch {
          isDir = false;
        }
        if (isDir) walk(rel);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && /gemini-[0-9][0-9a-z.-]*image/i.test(read(rel))) hits.push(rel);
      }
    };
    for (const d of dirs) walk(d);
    expect(hits).toEqual(['lib/ai/gemini.ts']);
  });
});

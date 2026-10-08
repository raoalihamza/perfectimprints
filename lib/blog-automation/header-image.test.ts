/**
 * AUTO-202: the pure rules of the blog header image: the three sources and
 * their fallback order, the library and product picks, the prompt's hard
 * rules, the check, the alt text and the summaries.
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
  type ReferenceProduct,
  type ScenePlan,
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
  imageCheckProblem,
  imageValueFor,
  parseImageCheck,
  parseScenePlan,
  pickLibraryImage,
  pickReferenceProducts,
  productMatchesTopic,
  scrubProductText,
  topicProductWords,
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

  it('states the hard rules: no text when nothing was planned, no logos or brand names including background devices, no products beyond the references', () => {
    expect(prompt).toMatch(/No text anywhere/);
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

    it("allows ONLY the product's own text, as generic placeholders, and still forbids every brand element", () => {
      expect(planned).toContain('The ONLY text allowed in the image is what belongs on this product by its nature: a calendar grid with the twelve months and their dates.');
      expect(planned).toContain('never a brand name, a company name, a phone number, a web address, a slogan or a claim');
      expect(planned).not.toMatch(/^- No text anywhere/m);
      expect(planned).toMatch(/No logos, brand marks, trademarks, brand names, company names, phone numbers, web addresses or slogans/);
    });

    it('a plan whose product carries no text keeps the blanket no-text rule', () => {
      const p = buildHeaderImagePrompt({ title: 'T', topic: 'custom koozies', productNames: [], scene: { ...scene, productText: '' } });
      expect(p).toMatch(/^- No text anywhere/m);
      expect(p).toContain('where such a product really lives');
    });

    it('the retry names the problem and keeps the text rule the picture was drawn under', () => {
      const p = buildHeaderImagePrompt({ title: 'T', topic: 't', productNames: [], scene, previousProblem: 'a brand, company name or contact detail in text ("Acme Plumbing 555-0100")' });
      expect(p).toContain('rejected because it contained a brand, company name or contact detail in text ("Acme Plumbing 555-0100")');
      expect(p).toContain("no writing except the product's own generic text");
      const q = buildHeaderImagePrompt({ title: 'T', topic: 't', productNames: [], previousProblem: 'readable text' });
      expect(q).toContain('no writing at all');
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
  readableText: false,
  textSeen: '',
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  textOffProduct: false,
  textOffProductSeen: '',
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
    expect(user).toContain('productText is ONLY what belongs on the product by its nature');
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
});

describe('the check', () => {
  it('asks about text, logos including background objects, brand or contact text, text off the product and an impossible placement, JSON only', () => {
    const { system, user } = buildImageCheckPrompt();
    expect(system).toContain('ONE JSON object');
    expect(user).toContain('READABLE text');
    expect(user).toContain('LOGO, brand mark, trademark');
    expect(user).toContain('laptops, phones, cups');
    expect(user).toContain('BRAND NAME, a company or business name, a phone number, a web address');
    expect(user).toContain('(No text was requested anywhere.)');
    expect(user).toContain('could not physically be');
    for (const key of ['"readableText"', '"logo"', '"brandText"', '"textOffProduct"', '"impossible"']) expect(user).toContain(key);
    const allowed = buildImageCheckPrompt('a calendar grid').user;
    expect(allowed).toContain('The product itself may carry: a calendar grid.');
    expect(allowed).not.toContain('(No text was requested anywhere.)');
  });

  it('reads the answer defensively', () => {
    expect(parseImageCheck({ readableText: true, textSeen: 'SALE', logo: 'false', logoSeen: '' })).toEqual({ ...NONE, readableText: true, textSeen: 'SALE' });
    expect(parseImageCheck({ readableText: 'yes', logo: 'true', logoSeen: 'Apple', brandText: 'true', brandTextSeen: 'Acme', impossible: true, impossibleSeen: 'magnet on wood' })).toEqual({
      ...NONE,
      readableText: true,
      logo: true,
      logoSeen: 'Apple',
      brandText: true,
      brandTextSeen: 'Acme',
      impossible: true,
      impossibleSeen: 'magnet on wood',
    });
    expect(parseImageCheck('nonsense')).toEqual(NONE);
    expect(parseImageCheck(null)).toEqual(NONE);
  });

  it('a clean picture passes; text or a logo is named under the blanket rule', () => {
    expect(imageCheckProblem(NONE)).toBeNull();
    expect(imageCheckProblem({ ...NONE, readableText: true, textSeen: 'SALE' })).toBe('readable text ("SALE")');
    expect(imageCheckProblem({ ...NONE, logo: true, logoSeen: 'Apple' })).toBe('a logo or brand mark (Apple)');
    expect(imageCheckProblem({ ...NONE, readableText: true, logo: true })).toBe('a logo or brand mark and readable text');
  });

  it("when the product's own text was allowed, readable text alone passes but a brand, contact detail, text off the product or an impossible placement does not", () => {
    expect(imageCheckProblem({ ...NONE, readableText: true, textSeen: 'JANUARY 1 2 3' }, true)).toBeNull();
    expect(imageCheckProblem({ ...NONE, readableText: true, brandText: true, brandTextSeen: 'Acme Plumbing 555-0100' }, true)).toBe('a brand, company name or contact detail in text ("Acme Plumbing 555-0100")');
    expect(imageCheckProblem({ ...NONE, readableText: true, textOffProduct: true, textOffProductSeen: 'a wall sign reading OPEN' }, true)).toBe('text away from the product (a wall sign reading OPEN)');
    expect(imageCheckProblem({ ...NONE, impossible: true, impossibleSeen: 'the magnet is on a wooden desk' }, true)).toBe('the product somewhere it could not be (the magnet is on a wooden desk)');
    // Under the blanket rule the same impossible placement is refused too.
    expect(imageCheckProblem({ ...NONE, impossible: true })).toBe('the product somewhere it could not be');
  });
});

describe('the summary', () => {
  const image = imageValueFor('image-x', 'alt');
  it('says where the picture came from, and why when there are notes', () => {
    expect(headerImageSummary({ kind: 'asset', source: 'ai', image, notes: [] })).toBe("Header image: generated by the AI from the post's product photos.");
    expect(headerImageSummary({ kind: 'asset', source: 'library', image, notes: ['the image model failed: x'] })).toBe('Header image: a picture from the header image library (the image model failed: x).');
    expect(headerImageSummary({ kind: 'url', source: 'product', url: 'u', alt: 'a', notes: [] })).toBe("Header image: the post's first product photo, shown from Geiger's image server.");
    expect(headerImageSummary({ kind: 'none', notes: ['a', 'b'] })).toBe('Header image: none (a; b). Upload one, or press Generate header image on the draft.');
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

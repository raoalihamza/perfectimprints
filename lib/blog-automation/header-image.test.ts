/**
 * AUTO-202: the pure rules of the blog header image: the three sources and
 * their fallback order, the library and product picks, the prompt's hard
 * rules, the check, the alt text and the summaries.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHeaderImagePrompt,
  buildImageCheckPrompt,
  DEFAULT_HEADER_IMAGE_SOURCE,
  effectiveHeaderImageSource,
  firstProductImage,
  geigerReferenceUrl,
  HEADER_IMAGE_ASPECT_RATIO,
  HEADER_IMAGE_MAX_REFERENCES,
  HEADER_IMAGE_REFERENCE_WIDTH,
  HEADER_IMAGE_SIZE,
  HEADER_IMAGE_SOURCES,
  headerImageAlt,
  headerImageFilename,
  headerImageSourceOf,
  headerImageSummary,
  imageCheckProblem,
  imageValueFor,
  parseImageCheck,
  pickLibraryImage,
  pickReferenceProducts,
  productMatchesTopic,
  topicProductWords,
  type HeaderImageLibraryEntry,
  type ReferenceProduct,
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

  it('states the three hard rules: no text, no logos including background devices, no products beyond the references', () => {
    expect(prompt).toMatch(/No text anywhere/);
    expect(prompt).toMatch(/No logos, brand marks, trademarks/);
    expect(prompt).toContain('laptops, phones, tablets, cups, bottles, bags, shoes or clothing');
    expect(prompt).toContain('Show only products of the kinds in the reference photos');
    expect(prompt).toContain('Do not add other promotional products');
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

describe('the check', () => {
  it('asks about text and logos including background objects, JSON only', () => {
    const { system, user } = buildImageCheckPrompt();
    expect(system).toContain('ONE JSON object');
    expect(user).toContain('READABLE text');
    expect(user).toContain('LOGO, brand mark, trademark');
    expect(user).toContain('laptops, phones, cups');
    expect(user).toContain('"readableText"');
  });

  it('reads the answer defensively', () => {
    expect(parseImageCheck({ readableText: true, textSeen: 'SALE', logo: 'false', logoSeen: '' })).toEqual({ readableText: true, textSeen: 'SALE', logo: false, logoSeen: '' });
    expect(parseImageCheck({ readableText: 'yes', logo: 'true', logoSeen: 'Apple' })).toEqual({ readableText: true, textSeen: '', logo: true, logoSeen: 'Apple' });
    expect(parseImageCheck('nonsense')).toEqual({ readableText: false, textSeen: '', logo: false, logoSeen: '' });
    expect(parseImageCheck(null)).toEqual({ readableText: false, textSeen: '', logo: false, logoSeen: '' });
  });

  it('a clean picture passes; text or a logo is named', () => {
    expect(imageCheckProblem({ readableText: false, textSeen: '', logo: false, logoSeen: '' })).toBeNull();
    expect(imageCheckProblem({ readableText: true, textSeen: 'SALE', logo: false, logoSeen: '' })).toBe('readable text ("SALE")');
    expect(imageCheckProblem({ readableText: false, textSeen: '', logo: true, logoSeen: 'Apple' })).toBe('a logo or brand mark (Apple)');
    expect(imageCheckProblem({ readableText: true, textSeen: '', logo: true, logoSeen: '' })).toBe('readable text and a logo or brand mark');
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

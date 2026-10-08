/**
 * The header image a generated blog post gets (AUTO-202): the three sources,
 * the order they fall back in, the prompt the image model is given, the
 * check every generated picture must pass, and the shape of the answer. PURE:
 * no Sanity, no fs, no network, no next/*, so the Studio bundle, the server
 * resolver and vitest import the same rules.
 *
 * Patrick's decision (2026-10-05): "I want each blog post to have its own
 * unique image." Ali's on top of it: three sources with a site default in
 * Global Settings and a per-post override that falls back to the default when
 * empty, AI generated being the default; Generate Blog with AI makes an image
 * too; two controls on an image he does not like (generate another, upload
 * his own).
 *
 * THE THREE SOURCES AND THE FALLBACK ORDER. `ai` -> `library` -> `product` ->
 * nothing. The chosen source is where the chain STARTS; every step that
 * cannot deliver falls to the next, and "nothing" is today's behaviour (the
 * branded default social card), which is survivable. A failed image never
 * stops a draft being created: the resolver in resolve-header-image.ts never
 * throws, and the creator treats its answer as data.
 *
 * THE PROMPT FOLLOWS PATRICK'S OWN METHOD. He feeds ChatGPT his actual product
 * photographs, so the model is given the real product photos from the post's
 * own strips (up to HEADER_IMAGE_MAX_REFERENCES, fetched from Geiger's image
 * server at a modest width, sent and never stored) and told to show items
 * LIKE them, blank and unbranded, in a business setting. Text alone invents
 * products; the references pin the picture to what the post sells.
 *
 * THE SCENE IS PLANNED FIRST (AUTO-203). AUTO-202's pictures had the right
 * product in the wrong place: calendar magnets stuck to the SIDE OF A WOODEN
 * DESK, then lying flat on it like paper (Ali, 2026-10-08, twice on the same
 * topic). The reference photos show the object on white, so the model knew
 * its shape and nothing about where it lives. A cheap text call on the vision
 * model (`buildScenePlanPrompt`, GEMINI_MODEL, about 350 tokens, no search:
 * see lib/ai/gemini.ts generateJsonFromText) now reads the title, the topic
 * and the real product names and writes the scene: the surface the product
 * sits on or attaches to, the setting, who is in frame, what is around it,
 * what text genuinely belongs ON the product, and what would be physically
 * wrong. The image prompt is built from that plan; the photos keep the
 * product honest, the plan puts it where it lives. A planner that fails
 * leaves the prompt as AUTO-202 wrote it, under the old blanket no-text rule.
 *
 * THE HARD RULES, and how they are held. (1) TEXT: the blanket "no text"
 * rule is REPLACED. It made a calendar magnet carry a smudged grid, and a
 * calendar with no readable calendar is not a picture of a calendar magnet.
 * Text that genuinely belongs on the product is allowed and wanted (a
 * calendar's months and dates, a ruler's numbers, a notebook's lines), as
 * generic placeholders; NO brand name, logo, wordmark, company name, phone
 * number, web address, slogan or claim, anywhere, ever, and no text that is
 * not on the product. That boundary is stated in the prompt, scrubbed out of
 * the planner's own words (`scrubProductText`: a planner that volunteers "a
 * business logo and phone number" is overruled in code, not trusted), and
 * CHECKED. (2) No logo or brand mark belonging to anyone, INCLUDING ON
 * BACKGROUND OBJECTS: the very first probe (2026-10-05) drew five plain
 * bottles perfectly and an Apple mark on a laptop behind them, so the prompt
 * names devices, cups and clothing explicitly. (3) No product that is not in
 * the references. (4) Physically possible: the plan's `avoid` line is in the
 * prompt and the read-back asks whether the product is somewhere it could
 * not be. EVERY generated picture is read back by the vision model with
 * `buildImageCheckPrompt` and a picture that shows a logo, a brand or
 * company name, a phone number or address, text off the product, text on the
 * product when none was allowed, or an impossible placement is dropped (one
 * retry with the problem named, then the next source), never stored. The
 * check cannot see "a product that does not exist"; that rule is held by the
 * references and by Patrick reading the draft, and the report says so.
 */

import { geigerImageVariant } from '../blog/header-image';
import { NEAR_GENERIC_WORDS, NON_SIGNIFICANT_MATCH_WORDS } from '../ai/brand-voice';

export type HeaderImageSource = 'ai' | 'library' | 'product';

export const HEADER_IMAGE_SOURCES: readonly HeaderImageSource[] = ['ai', 'library', 'product'];

/** The site default when Global Settings says nothing: Patrick's choice. */
export const DEFAULT_HEADER_IMAGE_SOURCE: HeaderImageSource = 'ai';

/** Studio wording for the two dropdowns (the schema mirrors these values inline). */
export const HEADER_IMAGE_SOURCE_LABELS: Record<HeaderImageSource, string> = {
  ai: 'AI generated from the post and its product photos',
  library: 'A picture from the header image library',
  product: "The post's first product photo (shown from Geiger's image server)",
};

/** The stored value read back; anything else is "not set". */
export function headerImageSourceOf(value: unknown): HeaderImageSource | null {
  return typeof value === 'string' && (HEADER_IMAGE_SOURCES as readonly string[]).includes(value) ? (value as HeaderImageSource) : null;
}

/** The post's own setting when set, else the site default, else AI generated. Empty means "use the default", so Patrick never has to set it. */
export function effectiveHeaderImageSource(postOverride: unknown, siteDefault: unknown): HeaderImageSource {
  return headerImageSourceOf(postOverride) ?? headerImageSourceOf(siteDefault) ?? DEFAULT_HEADER_IMAGE_SOURCE;
}

// -- The library ---------------------------------------------------------------

/** One entry of `globalSettings.blogAutomation.headerImageLibrary`, resolved. */
export interface HeaderImageLibraryEntry {
  /** The root category slug the picture is for, or null for a picture any post may use. */
  rootSlug: string | null;
  /** The uploaded image asset's `_ref`. */
  assetRef: string;
  alt: string | null;
}

/** The image value written onto a blog post (`headerImage`). */
export interface SanityImageValue {
  _type: 'image';
  asset: { _type: 'reference'; _ref: string };
  alt?: string;
}

/**
 * The library picture for a post: the first entry whose root slug is one of
 * the post's (in the post's order), else the first entry with no root slug
 * (the "any post" picture). Null when the library has nothing for it, which
 * is the state at launch: Patrick has uploaded no library pictures and may
 * never, and the chain simply moves on.
 */
export function pickLibraryImage(
  library: readonly HeaderImageLibraryEntry[],
  rootSlugs: readonly string[],
): HeaderImageLibraryEntry | null {
  for (const slug of rootSlugs) {
    const hit = library.find((e) => e.rootSlug === slug && e.assetRef);
    if (hit) return hit;
  }
  return library.find((e) => e.rootSlug === null && e.assetRef) ?? null;
}

export function imageValueFor(assetRef: string, alt: string | null | undefined): SanityImageValue {
  const value: SanityImageValue = { _type: 'image', asset: { _type: 'reference', _ref: assetRef } };
  const a = alt?.trim();
  if (a) value.alt = a;
  return value;
}

// -- The products ----------------------------------------------------------------

/** What the image step needs from a strip product. */
export interface ReferenceProduct {
  sku: string;
  name: string;
  imageUrl: string | null;
}

/** Reference photos sent to the image model per picture. Flash accepts up to 10 object references; four is plenty to pin the product type and keeps the request small. */
export const HEADER_IMAGE_MAX_REFERENCES = 4;
/** The width each reference photo is fetched at (the catalog URL asks for 275; the model reads detail from 600 and no more is needed). */
export const HEADER_IMAGE_REFERENCE_WIDTH = 600;

function isGeigerImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.toLowerCase() === 'imgsirv.geiger.com';
  } catch {
    return false;
  }
}

/**
 * Words of a topic that name the PRODUCT: everything but the promo words and
 * filler every search carries ("custom", "promotional", "bulk", "ideas"...),
 * stemmed by a trailing s. "custom pedometers" gives ["pedometer"];
 * "custom coolers with logo" gives ["cooler"]. The word lists are the site's
 * shared ones in lib/ai/brand-voice.ts (the matcher's and the topic guard's),
 * plus a few words a SEARCH carries that a product name never does.
 */
const TOPIC_NOISE_WORDS: ReadonlySet<string> = new Set<string>([
  ...NON_SIGNIFICANT_MATCH_WORDS,
  ...NEAR_GENERIC_WORDS,
  'promo', 'imprinted', 'engraved', 'embroidered', 'cheap', 'best', 'top', 'ways', 'guide', 'your', 'our',
  'corporate', 'giveaway', 'giveaways', 'order', 'orders', 'small', 'large', 'quantity', 'minimum',
]);

function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

export function topicProductWords(topic: string): string[] {
  const out: string[] = [];
  for (const raw of topic.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || TOPIC_NOISE_WORDS.has(raw)) continue;
    const s = stem(raw);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** True when the product's name carries one of the topic's product words. */
export function productMatchesTopic(name: string, topicWords: readonly string[]): boolean {
  if (topicWords.length === 0) return true;
  const nameWords = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem));
  return topicWords.some((w) => nameWords.has(w));
}

/**
 * The reference photos: the first `max` strip products with a Geiger photo
 * WHOSE NAME CARRIES A TOPIC WORD, each SKU once, in strip order. The topic
 * test exists because of the second proof draft (2026-10-05): the
 * "custom pedometers" post's strips were clips (FIX-900's remaining drift
 * class, which no image rule can fix), the four clip photos went to the
 * model as "the actual products the post recommends", and it drew clips,
 * faithfully and wrongly. A strip product that shares no word with the topic
 * is not evidence of what the post sells; with none left the prompt
 * describes the item the title names instead, which draws a generic
 * pedometer, a thing that exists, rather than the wrong thing. With no topic
 * given, every product with a photo qualifies.
 */
export function pickReferenceProducts(products: readonly ReferenceProduct[], max = HEADER_IMAGE_MAX_REFERENCES, topic = ''): ReferenceProduct[] {
  const words = topicProductWords(topic);
  const out: ReferenceProduct[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    if (out.length >= max) break;
    if (!p || seen.has(p.sku) || !isGeigerImageUrl(p.imageUrl)) continue;
    if (!productMatchesTopic(p.name ?? '', words)) continue;
    seen.add(p.sku);
    out.push(p);
  }
  return out;
}

/** The URL a reference photo is fetched from: the Geiger photo at HEADER_IMAGE_REFERENCE_WIDTH, or null for any other host (nothing else is ever fetched). */
export function geigerReferenceUrl(url: unknown): string | null {
  return isGeigerImageUrl(url) ? geigerImageVariant(url, HEADER_IMAGE_REFERENCE_WIDTH) : null;
}

/**
 * The post's first product photo, the last fallback: a hot link, never an
 * upload (Section 18). Under the SAME topic rule as the references (the
 * review of the proof run): a strip product that shares no word with the
 * topic is not the post's product and must not become its hero, og:image and
 * card picture; with no match there is no product fallback.
 */
export function firstProductImage(products: readonly ReferenceProduct[], topic = ''): { url: string; alt: string } | null {
  const words = topicProductWords(topic);
  const first = products.find((p) => p && isGeigerImageUrl(p.imageUrl) && productMatchesTopic(p.name ?? '', words));
  if (!first) return null;
  return { url: first.imageUrl as string, alt: first.name.trim() || 'Promotional product' };
}

// -- The scene plan (AUTO-203) -------------------------------------------------

/** Where the product lives, written by the planner before the picture is drawn. */
export interface ScenePlan {
  /** What the product sits on or is attached to: "the door of a stainless steel refrigerator". */
  surface: string;
  /** The room or place. */
  setting: string;
  /** "none", or who and where, out of focus. */
  people: string;
  /** Two to four things around the product. */
  around: string[];
  /** Text that genuinely belongs ON this product, as generic placeholders; empty when the product carries none. */
  productText: string;
  /** What would be physically wrong for this product ("lying flat on a desk", "stuck to wood"). */
  avoid: string;
}

/** Words that may never describe text in an image, on the product or off it. The planner's own wording is scrubbed against this list. */
export const FORBIDDEN_TEXT_WORDS: readonly string[] = [
  'logo', 'brand', 'branded', 'branding', 'wordmark', 'trademark', 'company name', 'business name', 'company',
  'phone', 'telephone', 'number', 'website', 'web address', 'url', 'email', 'e-mail', 'slogan', 'tagline', 'contact', 'address', 'name',
];

const SCENE_FIELD_MAX = 240;

function cleanLine(value: unknown, max = SCENE_FIELD_MAX): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function hasForbiddenWord(clause: string): boolean {
  return FORBIDDEN_TEXT_WORDS.some((w) => new RegExp(`\\b${w.replace(/[-/]/g, '\\$&')}(?:s|es)?\\b`, 'i').test(clause));
}

/**
 * The planner's `productText`, with every clause that names a brand, a
 * company, a phone number, a web address or a slogan REMOVED. The planner
 * was observed (2026-10-08 probe) to volunteer "a small business logo and
 * contact phone number" for a calendar magnet, because that is what a real
 * one carries; the picture must carry only the calendar. Clauses are split
 * on commas, semicolons, "and", "with", "alongside", "plus", "featuring",
 * "including"; a clause carrying a forbidden word is dropped whole, and when
 * the FIRST clause is dropped the rest is dropped too (what follows was
 * describing the brand element). Returns '' when nothing allowed is left.
 */
export function scrubProductText(text: string): string {
  const raw = cleanLine(text, 300);
  if (!raw || /^(none|no text|n\/a|nothing)\b/i.test(raw)) return '';
  const separator = /\s*(?:,|;|\band\b|\bwith\b|\balongside\b|\bplus\b|\bfeaturing\b|\bincluding\b)\s*/gi;
  const clauses: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let m = separator.exec(raw); m !== null; m = separator.exec(raw)) {
    clauses.push({ start: cursor, end: m.index });
    cursor = m.index + m[0].length;
    if (m[0].length === 0) separator.lastIndex += 1;
  }
  clauses.push({ start: cursor, end: raw.length });
  let keptEnd = 0;
  let keptAny = false;
  for (const c of clauses) {
    const clause = raw.slice(c.start, c.end).trim();
    if (!clause) continue;
    if (hasForbiddenWord(clause)) {
      // The original wording is kept up to the dropped clause ("inch and centimetre markings" stays as written).
      return keptAny ? raw.slice(0, keptEnd).replace(/[\s,;]+$/, '').trim() : '';
    }
    keptEnd = c.end;
    keptAny = true;
  }
  return raw.slice(0, keptEnd).trim();
}

/** The planner's instructions: a JSON scene for this product, physically correct, with the text rule stated. */
export function buildScenePlanPrompt(input: { title: string; topic: string; productNames: readonly string[] }): { system: string; user: string } {
  const refs = input.productNames.map((n) => n.trim()).filter(Boolean);
  return {
    system:
      'You plan the one photograph that heads a business blog post about promotional products. You know how real products are used and photographed: a magnet is on a refrigerator or a filing cabinet, a koozie is around a can, a lanyard is around a neck, a tote is carried or on a counter, a pen is on paper. You answer with ONE JSON object and nothing else.',
    user: [
      `Blog post title: "${input.title.trim()}"`,
      `Topic: ${input.topic.trim()}`,
      refs.length > 0 ? `The actual products shown in the post: ${refs.join('; ')}.` : 'No product list is available; use the kind of item the title names.',
      'Describe a realistic scene where this product is seen IN USE the way its buyer sees it, in a business or everyday setting. Rules:',
      '- The placement must be physically possible for THIS product (a magnet holds only on steel; a koozie goes around a can, not beside it; a shirt is worn or folded).',
      '- No brand name, logo, wordmark, company name, phone number, web address or slogan anywhere, on the product or in the background; the product is a blank sample of its kind.',
      '- productText is ONLY what belongs on the product by its nature, as generic placeholders: a calendar grid with months and dates, the numbers on a ruler, the lines of a notebook. Write "none" when the product carries no text.',
      'Return exactly: {"surface": "what the product sits on or is attached to", "setting": "the room or place", "people": "none, or who and where, out of focus", "around": ["2 to 4 things around it"], "productText": "generic text that belongs on the product, or none", "avoid": "what would be physically wrong for this product"}',
    ].join('\n'),
  };
}

/** The planner's answer read defensively, lengths capped, the text rule enforced in code. Null when it says nothing usable. */
export function parseScenePlan(raw: unknown): ScenePlan | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const surface = cleanLine(r.surface);
  const setting = cleanLine(r.setting);
  if (!surface && !setting) return null;
  const aroundRaw = Array.isArray(r.around) ? r.around : typeof r.around === 'string' ? r.around.split(/[,;]/) : [];
  const around = aroundRaw
    .map((a) => cleanLine(a, 120))
    .filter((a) => a && !hasForbiddenWord(a))
    .slice(0, 4);
  return {
    surface,
    setting,
    people: cleanLine(r.people) || 'none',
    around,
    productText: scrubProductText(cleanLine(r.productText, 300)),
    avoid: cleanLine(r.avoid),
  };
}

// -- The prompt ------------------------------------------------------------------

/** Wide, the shape of every header on the blog (the hero renders at 1400 wide, the cards at 16:9). */
export const HEADER_IMAGE_ASPECT_RATIO = '16:9';
/** 1K is 1376 x 768 for 16:9 on the chosen model (measured 2026-10-05); the 2K size costs half as much again and the hero is 1400 wide. */
export const HEADER_IMAGE_SIZE = '1K';

export interface HeaderImagePromptInput {
  title: string;
  topic: string;
  /** Names of the reference products sent alongside, in the same order; empty when no product photo was available. */
  productNames: readonly string[];
  /** The planner's scene (AUTO-203); null when the planner failed, which brings back AUTO-202's prompt and its blanket no-text rule. */
  scene?: ScenePlan | null;
  /** Set on the one retry: what the check found in the previous attempt. */
  previousProblem?: string | null;
}

/** The no-brand rule, stated once. */
const NO_BRAND_RULE =
  'No logos, brand marks, trademarks, brand names, company names, phone numbers, web addresses or slogans on anything, including on background objects such as laptops, phones, tablets, cups, bottles, bags, shoes or clothing. Where a logo or a company name would be printed, leave the area blank or use a plain abstract shape with no brand meaning.';

/** The prompt sent to the image model with the reference photographs. */
export function buildHeaderImagePrompt(input: HeaderImagePromptInput): string {
  const title = input.title.trim();
  const topic = input.topic.trim();
  const refs = input.productNames.filter((n) => n.trim());
  const scene = input.scene ?? null;
  const lines: string[] = [];
  lines.push(`Create one wide (16:9) photograph-style header image for a business blog post titled "${title}".`);
  lines.push(
    `The post is about ${topic} for organizations that order promotional products in bulk: marketing directors, HR directors, safety managers and business owners.`,
  );
  const what = refs.length > 0 ? 'items like these' : 'the kind of item the title names';
  const placement = scene
    ? `Show ${what} in use, where such a product really lives: ${scene.surface}${scene.setting ? `, in ${scene.setting}` : ''}.${scene.around.length > 0 ? ` Around it: ${scene.around.join(', ')}.` : ''} People: ${scene.people || 'none'}.`
    : `Show ${what}, blank and unbranded, arranged in a clean, realistic setting a marketing or HR manager would recognise, for example an office desk, a trade show table, an event tent, a company picnic or a reception counter.`;
  if (refs.length > 0) {
    lines.push(
      `The attached ${refs.length === 1 ? 'photo is' : `${refs.length} photos are`} the actual products the post recommends (${refs.join('; ')}). Use ${refs.length === 1 ? 'it' : 'them'} as the reference for what the items look like: their shape, materials, proportions and colours. ${placement}`,
    );
  } else {
    lines.push(placement);
  }
  lines.push('Rules, every one of them strict:');
  if (scene && scene.productText) {
    lines.push(
      `- The ONLY text allowed in the image is what belongs on this product by its nature: ${scene.productText}. Render it as readable generic placeholder content (real-looking months, dates, numbers or lines), never a brand name, a company name, a phone number, a web address, a slogan or a claim. No other text anywhere else: no labels, signs, price tags, screens with writing or writing in the background.`,
    );
  } else {
    lines.push('- No text anywhere in the image: no letters, numbers, words, labels, signs, price tags, screens with writing or writing in the background.');
  }
  lines.push(`- ${NO_BRAND_RULE}`);
  if (refs.length > 0) {
    lines.push('- Show only products of the kinds in the reference photos. Do not add other promotional products and do not invent features, colours or details that are not in the references.');
  } else {
    lines.push('- Show only the kind of product the title names. Do not add other promotional products and do not invent features that such a product does not have.');
  }
  if (scene?.avoid) {
    lines.push(`- The placement must be physically possible for this product. Physically wrong, and not to be shown: ${scene.avoid}.`);
  }
  lines.push('- No close-up faces. People, if any, are in the background and out of focus.');
  lines.push('- Natural daylight, soft shadows, shallow depth of field, an editorial photography look. Not an illustration, not a collage, no borders, no frames, no watermark.');
  if (input.previousProblem?.trim()) {
    lines.push(
      `The previous attempt was rejected because it contained ${input.previousProblem.trim()}. Compose the scene again with none of that: no brand marks, no company names, no contact details, ${scene?.productText ? "no writing except the product's own generic text" : 'no writing at all'}, and the product only where it could really be.`,
    );
  }
  return lines.join('\n');
}

function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** The alt text stored with a generated picture: what the prompt asked for, said plainly, and that it is illustrative. */
export function headerImageAlt(topic: string): string {
  const t = sentenceCase(topic);
  return `${t || 'Promotional products'} shown blank and unbranded in a business setting (illustrative image)`;
}

/** The asset filename, so a picture in Studio's media library says which post and attempt it was. */
export function headerImageFilename(slug: string, attempt: number): string {
  const base = slug.trim().replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'blog-header';
  return `${base}-header${attempt > 1 ? `-${attempt}` : ''}.jpg`;
}

// -- The check -------------------------------------------------------------------

export interface ImageCheck {
  /** Any readable text at all (AUTO-202's question, kept so a picture under the blanket rule is still refused on it). */
  readableText: boolean;
  textSeen: string;
  logo: boolean;
  logoSeen: string;
  /** AUTO-203: a brand name, company name, phone number, web address, slogan or claim, in any text. */
  brandText: boolean;
  brandTextSeen: string;
  /** AUTO-203: readable text that is NOT on the product itself (a sign, a screen, a label, a background). */
  textOffProduct: boolean;
  textOffProductSeen: string;
  /** AUTO-203: the product somewhere it could not physically be. */
  impossible: boolean;
  impossibleSeen: string;
}

/**
 * The vision model's instructions for reading a generated picture back.
 * `allowedProductText` is the plan's product text when the prompt allowed
 * some, so the check knows what was asked for; null means none was allowed.
 */
export function buildImageCheckPrompt(allowedProductText: string | null = null): { system: string; user: string } {
  return {
    system:
      'You inspect images before they are published on a business website. You answer with ONE JSON object and nothing else. Be literal: report what is visibly there, do not guess at intent.',
    user: [
      'Look at this image carefully, including the background, and answer:',
      '1. Is there any READABLE text anywhere: letters, numbers, words, a slogan, a label, a sign, a screen with writing, a price? Decorative patterns and blank labels are not text.',
      '2. Is there any LOGO, brand mark, trademark or recognisable brand design anywhere, including on laptops, phones, cups, bottles, bags, shoes or clothing in the background? A blank imprint area or an abstract shape with no brand meaning is not a logo.',
      '3. Does any text read as a BRAND NAME, a company or business name, a phone number, a web address, an email address, a slogan or a marketing claim, real or invented? Generic placeholder content (month names, dates, numbers on a ruler, lines on a page) is not a brand.',
      allowedProductText
        ? `4. Is there readable text anywhere OTHER THAN on the product itself (the main item shown)? The product itself may carry: ${allowedProductText}. Text on signs, screens, papers, walls or other objects counts.`
        : '4. Is there readable text anywhere other than on the main product shown? (No text was requested anywhere.)',
      '5. Is the main product somewhere it could not physically be, or used in a way it could not be used (a magnet stuck to wood or glass, a can cooler standing beside the can instead of around it, a wall clock lying on a table as if it were a plate)?',
      'Return exactly: {"readableText": true or false, "textSeen": "the text you can read, or an empty string", "logo": true or false, "logoSeen": "which logo or brand, or an empty string", "brandText": true or false, "brandTextSeen": "the brand, company, phone, address or slogan text, or an empty string", "textOffProduct": true or false, "textOffProductSeen": "where and what, or an empty string", "impossible": true or false, "impossibleSeen": "what is physically wrong, or an empty string"}',
    ].join('\n'),
  };
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes)$/i.test(value.trim());
  return false;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

/** The model's answer read defensively; a missing or wrong-typed field reads as "nothing seen". */
export function parseImageCheck(raw: unknown): ImageCheck {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    readableText: bool(r.readableText),
    textSeen: text(r.textSeen),
    logo: bool(r.logo),
    logoSeen: text(r.logoSeen),
    brandText: bool(r.brandText),
    brandTextSeen: text(r.brandTextSeen),
    textOffProduct: bool(r.textOffProduct),
    textOffProductSeen: text(r.textOffProductSeen),
    impossible: bool(r.impossible),
    impossibleSeen: text(r.impossibleSeen),
  };
}

/**
 * Why a checked picture is refused, or null when it passes. `productTextAllowed`
 * is true when the prompt allowed the product's own text: then readable text
 * alone is not a problem, only a brand or company name, a contact detail, a
 * slogan, text off the product, a logo, or an impossible placement is. Under
 * the blanket rule (no plan, or a plan with no product text) any readable
 * text still refuses the picture, exactly as AUTO-202 did.
 */
export function imageCheckProblem(check: ImageCheck, productTextAllowed = false): string | null {
  const problems: string[] = [];
  if (check.logo) problems.push(`a logo or brand mark${check.logoSeen ? ` (${check.logoSeen})` : ''}`);
  if (check.brandText) problems.push(`a brand, company name or contact detail in text${check.brandTextSeen ? ` ("${check.brandTextSeen}")` : ''}`);
  if (check.textOffProduct) problems.push(`text away from the product${check.textOffProductSeen ? ` (${check.textOffProductSeen})` : ''}`);
  else if (check.readableText && !productTextAllowed) problems.push(`readable text${check.textSeen ? ` ("${check.textSeen}")` : ''}`);
  if (check.impossible) problems.push(`the product somewhere it could not be${check.impossibleSeen ? ` (${check.impossibleSeen})` : ''}`);
  return problems.length > 0 ? problems.join(' and ') : null;
}

// -- The outcome -----------------------------------------------------------------

export interface HeaderImageUsage {
  model: string;
  /** Image output tokens Google reported (the billed unit for the picture). */
  imageTokens: number;
  promptTokens: number;
  elapsedMs: number;
  /** Generations made for this picture (1, or 2 when the first failed the check). */
  attempts: number;
  /** The daily counter after this picture: slots used today, and the cap. */
  capUsed?: number;
  cap?: number;
  /** AUTO-203: the scene planner's call, when it ran (tokens on GEMINI_MODEL). */
  planner?: { model: string; promptTokens: number; outputTokens: number; elapsedMs: number } | null;
  /** AUTO-203: the plan the picture was drawn from, for the report and the Studio dialog. */
  scene?: ScenePlan | null;
}

export type HeaderImageOutcome =
  | { kind: 'asset'; source: 'ai' | 'library'; image: SanityImageValue; notes: string[]; usage?: HeaderImageUsage }
  | { kind: 'url'; source: 'product'; url: string; alt: string; notes: string[] }
  | { kind: 'none'; notes: string[] };

/** One sentence for the panel and the Studio dialogs. */
export function headerImageSummary(outcome: HeaderImageOutcome): string {
  const why = outcome.notes.length > 0 ? ` (${outcome.notes.join('; ')})` : '';
  if (outcome.kind === 'asset' && outcome.source === 'ai') return `Header image: generated by the AI from the post's product photos${why}.`;
  if (outcome.kind === 'asset') return `Header image: a picture from the header image library${why}.`;
  if (outcome.kind === 'url') return `Header image: the post's first product photo, shown from Geiger's image server${why}.`;
  return `Header image: none${why}. Upload one, or press Generate header image on the draft.`;
}

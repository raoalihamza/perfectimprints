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
 * number, web address, slogan or claim, anywhere, ever. That boundary is
 * stated in the prompt, scrubbed out of the planner's own words
 * (`scrubProductText`: a planner that volunteers "a business logo and phone
 * number" is overruled in code, not trusted), and CHECKED. (2) No logo or
 * brand mark belonging to anyone, INCLUDING ON BACKGROUND OBJECTS: the very
 * first probe (2026-10-05) drew five plain bottles perfectly and an Apple
 * mark on a laptop behind them, so the prompt names devices, cups and
 * clothing explicitly. (3) No product that is not in the references.
 * (4) Physically possible: the plan's `avoid` line is in the prompt and the
 * read-back asks whether the product is somewhere it could not be. EVERY
 * generated picture is read back by the vision model with
 * `buildImageCheckPrompt`, and a refused picture is dropped (one retry with
 * the problem named, then the next source), never stored. The check cannot
 * see "a product that does not exist"; that rule is held by the references
 * and by Patrick reading the draft, and the report says so.
 *
 * WHAT TEXT A PICTURE MAY CARRY (AUTO-204). The check does not ask one
 * yes-or-no question about "text off the product" any more. It LISTS each
 * readable piece of text with the object it is on and what KIND of text it
 * is, and the verdict is decided here, in `imageCheckProblem`:
 *
 *   marking  the functional markings an object carries by its nature (a
 *            measuring scale and its numbers and units, a clock's numerals,
 *            a display readout, a calendar's months and dates, a pill box's
 *            day letters). PASSES, on the product or on anything else, and
 *            whether or not the planner predicted it.
 *   page     small running text or handwriting on the page of an open book,
 *            a notebook or a document, too small to be a title. PASSES: a
 *            cookbook beside measuring cups is a prop, and a brand cannot
 *            sit in text that size.
 *   display  any other words: a title, a heading, a cover, a label, a sign,
 *            a screen, a badge, a print on clothing, or a word, a name or a
 *            message printed on the product as decoration ("EMPLOYEE OF THE
 *            MONTH" engraved on a desk clock). REFUSED, on the product or
 *            off it: display text is where a name sits.
 *   brand    a brand, company, product or person name, a phone number, a web
 *            or email address, a slogan, a claim, a price. REFUSED anywhere.
 *
 * Why it changed. Ali's measuring cups draft (2026-10-11) had both generated
 * pictures refused for "text away from the product (Text printed on the
 * measuring cups...)". Reproduced on a picture of the same scene: it passed
 * 9 reads of 9 when the check was told the cups may carry "graduated
 * measurement lines", and was refused 5 of 5 when it was told nothing was
 * allowed, twice in those words; and a tape measure was refused once in 9
 * reads for "Numbers printed on the yellow tape measure blade". Three faults
 * stacked: (a) the scrubber's forbidden list held the bare word "number"
 * (meant for "phone number"), so the numerals were cut from the plan in 17
 * of 30 sampled plans (12 of 15 for measuring cups) and "clock face numbers"
 * was cut to nothing; (b) what was left was then used as the complete list
 * of what the product may carry; (c) the old question "is there text other
 * than on the main product?" was answered with the product's own markings
 * whenever it was told "no text was requested". And it erred the other way
 * too: the read the old chain made PASSED a wall clock picture that carries
 * an Apple logo on a laptop and an award engraved on a desk clock (of nine
 * reads of that picture, two passed it and four missed the logo). So the
 * brand and logo questions are word for word what they were, the listing is
 * added beside them, a phone number or web address in any listed text is
 * refused in code whatever kind the model gave it
 * (`looksLikeContactDetail`), an answer with no usable list is refused
 * rather than passed, and the picture is read IMAGE_CHECK_READS times with
 * the worst answer winning. Measured after: 0 refusals in 35 reads of eight
 * pictures whose only text is their own markings, with or without a plan;
 * the wall clock refused 7 reads of 7; the deliberate "ACME PLUMBING
 * 555-0100" pictures refused 5 of 5.
 *
 * FEW THINGS, SHOWN SIMPLY (AUTO-207; the numbers are in CLAUDE.md). The
 * planner sees the reference photos, so it describes the product they show
 * and not its catalogue name (ARRANGEMENT_FROM_PHOTOS_RULE); it writes how
 * many to show and in what state (ARRANGEMENT_RULE, AUTO-206's wording) and
 * which photo that is (`photos`); the image model is sent only that photo
 * (`photosForPicture`), because four different photos made it draw one of
 * each whatever the words said. A product's standard designation (FIRST AID,
 * SPF 30) is its own text (STANDARD_DESIGNATIONS). Device-mounted roots are
 * never drawn (DEVICE_MOUNTED_ROOTS). Nothing here judges whether a product
 * looks real: AUTO-206 measured every model on the key at that and none can.
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

/**
 * DEVICE-MOUNTED ROOTS (AUTO-207). Products that only make sense ON a phone,
 * a tablet or a laptop: a header picture may not show one (the device rule,
 * AUTO-205), and the product drawn on its own is not recognisable. For these
 * the AI is not asked at all (no money is spent on a picture the device rule
 * will destroy); the chain goes to the library, then the product photo. The
 * honest picture is Patrick's own, through the header image library: one
 * library picture per root below ends the stand-in for good. The list is the
 * measured one; see CLAUDE.md AUTO-207 for how each root was decided.
 */
export const DEVICE_MOUNTED_ROOTS: readonly string[] = ['webcam-covers', 'phone-wallets'];

/** The first of the post's roots that is device-mounted, or null. */
export function deviceMountedRoot(rootSlugs: readonly string[]): string | null {
  return rootSlugs.find((s) => DEVICE_MOUNTED_ROOTS.includes(s)) ?? null;
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
  /**
   * The catalogue's brand name, when the product is a brand-name good
   * (AUTO-205: 1,268 of 8,200 records carry one; 49 of the 50 products named
   * "koozie" are KOOZIE brand). A brand-name product's photo shows the
   * maker's tag, which is how the live koozies post came to carry four
   * invented emblems and side tags lettered like the Koozie tag.
   */
  brand?: string | null;
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
  const eligible: ReferenceProduct[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    if (!p || seen.has(p.sku) || !isGeigerImageUrl(p.imageUrl)) continue;
    if (!productMatchesTopic(p.name ?? '', words)) continue;
    seen.add(p.sku);
    eligible.push(p);
  }
  // AUTO-205 (brand defence 1b): an unbranded product's photo is preferred as
  // a reference, in strip order; brand-name products fill the remaining
  // slots, so a post whose every product is brand-name (koozies) still gets
  // its references, with the prompt's tag rule doing the work.
  const unbranded = eligible.filter((p) => !isBrandNameProduct(p));
  const branded = eligible.filter((p) => isBrandNameProduct(p));
  return [...unbranded, ...branded].slice(0, max);
}

/** True when the catalogue records a brand name for the product. */
export function isBrandNameProduct(p: Pick<ReferenceProduct, 'brand'>): boolean {
  return typeof p.brand === 'string' && p.brand.trim().length > 0;
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
  /**
   * AUTO-207: HOW MANY of the product and IN WHAT STATE, described as the
   * reference photos show it ("one closed red roll-top first aid bag"), never
   * from the catalogue name. Empty when the planner gave none; the image
   * prompt then carries DEFAULT_ARRANGEMENT, so the count rule never lapses.
   */
  arrangement: string;
  /**
   * AUTO-207: which of the attached photos (1-based, in the order attached)
   * the arrangement shows, at most three. The image model is sent THOSE
   * photos only (`photosForPicture`); empty means the planner named none and
   * every photo is sent, as before.
   */
  photos: number[];
  /** What would be physically wrong for this product ("lying flat on a desk", "stuck to wood"). */
  avoid: string;
}

/**
 * Words that may never describe text in an image, on the product or off it.
 * The planner's own wording is scrubbed against this list.
 *
 * AUTO-204: the bare words "number" and "name" are NOT on it. They were, to
 * catch "phone number" and "company name", and they cut the numerals out of
 * every product that has a scale: "capacity numbers" (measuring cups, 12 of
 * 15 plans), "tick marks and numbers" (tape measures), "clock face numbers"
 * (cut to nothing, which put a wall clock under the no-text rule). The
 * contact and company senses are still caught by the words beside them
 * (phone, telephone, contact, company, business name), and a "name" is
 * still refused unless the clause is about months or days (`namesABrand`).
 */
export const FORBIDDEN_TEXT_WORDS: readonly string[] = [
  'logo', 'brand', 'branded', 'branding', 'wordmark', 'trademark', 'company name', 'business name', 'company',
  'phone', 'telephone', 'fax', 'hotline', 'toll-free', 'toll free', 'website', 'web address', 'url', 'email', 'e-mail',
  'slogan', 'tagline', 'motto', 'contact', 'address', 'price',
];

/** "name" names a brand ("your name", "the store's name") unless the clause is about calendar content ("month names", "names of the days"). */
function namesABrand(clause: string): boolean {
  return /\bnames?\b/i.test(clause) && !/\b(month|day|weekday)s?\b/i.test(clause);
}

const SCENE_FIELD_MAX = 240;

function cleanLine(value: unknown, max = SCENE_FIELD_MAX): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function hasForbiddenWord(clause: string): boolean {
  if (namesABrand(clause)) return true;
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

/**
 * THE COUNT AND STATE RULE (AUTO-206, measured; AUTO-207, shipped). The
 * object count followed the REFERENCE count (one photo gave three clones,
 * eight gave nine or ten objects) and every multi-tool came out in its
 * supplier's everything-open pose, so the "custom tools" specimen read as a
 * catalogue spread: four real products, all fanned, on one bench. Nothing in
 * the planner or the prompt said how many to draw or in what state. With this
 * line the hard cases went from 7 not believable of 18 to 1 of 11 on the same
 * model, and the tools from 0 believable of 5 to 3 believable and 2 marginal.
 * Worded as AUTO-206 measured it; do not add a per-category part count (part
 * count was not the cause: keychains and first-aid kits have as many parts
 * and drew fine).
 */
export const ARRANGEMENT_RULE =
  '- arrangement: say HOW MANY of the product to show and in what state. Few and simple: ONE to THREE items, never more than three, large in the frame. A product with folding, sliding or moving parts (a multi-tool, a pocket knife, a tape measure, a carabiner tool) is shown in its simplest real state: closed or folded, with at most ONE item open, and that one with at most two implements out. A kit or a set is shown as ONE closed case, or one open case with its contents lying in it. Never a fan, a pile or a row of many.';

/**
 * THE NAMING TRAP (AUTO-206 found it, AUTO-207 closes it). For "Gold First
 * Aid Kit" the planner wrote "ONE closed gold metal first aid kit mounted on
 * the wall" and the picture showed a gold tin; the product is a RED ROLL-TOP
 * DRY BAG with its contents laid out, "Gold" being the tier. A text-only
 * planner cannot know that, so the planner now SEES the reference photos
 * (`photos` > 0) and is told the name can mislead. The example in the prompt
 * is deliberately NOT the first-aid case, so the proof on that case is not
 * the prompt reciting its own answer.
 */
export const ARRANGEMENT_FROM_PHOTOS_RULE =
  '- The arrangement, and every word you write about the product, describes it AS THE ATTACHED PHOTOS SHOW IT: its kind, shape, material and colour come from the photos and never from the product names. Catalogue names carry tier, model and collection words that are not materials or colours (a "Platinum Tumbler" may be plain blue plastic; a "Titan Pen" is not made of titanium). The photos may show a sample imprint, a logo, a brand tag or packaging text: that is the catalogue sample, not the product, and none of it is described or copied.';

/**
 * THE DEVICE RULE, TOLD TO THE PLANNER (AUTO-207). AUTO-205 made the image
 * prompt and the check refuse every laptop, monitor, tablet and phone, but the
 * planner still read AUTO-204's "unless this product is used with one", so it
 * planned webcam covers on "the upper plastic bezel of an open laptop
 * screen"; the image rule then removed the laptop and the model drew covers on
 * an empty frame. The two rules fought; now they say the same thing.
 */
export const PLANNER_DEVICE_RULE =
  '- No laptops, computers, monitors, tablets or phones anywhere in the scene, not even partly visible and not even when the product is used with one: a picture with any such device in it is rejected. A product that attaches to a phone, a tablet or a laptop is planned on its own, unattached, on a surface or in a hand.';

/**
 * AUTO-207: the scene planner's answer, as a response schema (Google's
 * OpenAPI subset). With it the model's decoding is constrained to this shape,
 * which removes the malformed answers AUTO-206 saw (3 in 64: a dropped key
 * name and unquoted keys). Every field is required, so a missing key cannot
 * pass either.
 */
export const PLANNER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    surface: { type: 'STRING' },
    setting: { type: 'STRING' },
    people: { type: 'STRING' },
    around: { type: 'ARRAY', items: { type: 'STRING' } },
    productText: { type: 'STRING' },
    arrangement: { type: 'STRING' },
    photos: { type: 'ARRAY', items: { type: 'INTEGER' } },
    avoid: { type: 'STRING' },
  },
  required: ['surface', 'setting', 'people', 'around', 'productText', 'arrangement', 'photos', 'avoid'],
  propertyOrdering: ['surface', 'setting', 'people', 'around', 'productText', 'arrangement', 'photos', 'avoid'],
};

/**
 * THE OVERSHOOT (AUTO-207). With the count rule in the prompt and four
 * DIFFERENT reference photos, the main model drew one of each photo when the
 * plan asked for one item: 5 of 20 soak pictures (two tool cases, keychains,
 * measuring cups, phone stands; "One translucent plastic measuring cup filled
 * with flour" came out as eight cups and spoon sets). The reference count
 * beats the words. Sent ONLY the photo the plan describes, the same five came
 * out as one item each, 5 of 5, every one believable and none cloned (the
 * measuring cup with a correct 1/4, 1/2, 3/4, 1 cup scale). So the planner
 * still SEES all four photos (it chooses from them and reads the product's
 * real shape and colour from them) and names the ones its arrangement shows;
 * the image model is sent those. AUTO-206's "one reference gave clones" was
 * measured with no count in the prompt; with the count stated it did not
 * recur. Returns 0-based indexes; every photo when the plan names none that
 * exist.
 */
export const MAX_PHOTOS_PER_PICTURE = 3;

export function photosForPicture(photos: readonly number[] | null | undefined, available: number): number[] {
  const picked: number[] = [];
  for (const p of photos ?? []) {
    const i = Math.trunc(p) - 1;
    if (Number.isFinite(i) && i >= 0 && i < available && !picked.includes(i)) picked.push(i);
    if (picked.length >= MAX_PHOTOS_PER_PICTURE) break;
  }
  return picked.length > 0 ? picked : Array.from({ length: available }, (_, i) => i);
}

export interface ScenePlanPromptInput {
  title: string;
  topic: string;
  productNames: readonly string[];
  /** AUTO-207: how many reference photos are attached to the planner call, in the order of `productNames`; 0 for a text-only call. */
  photos?: number;
}

/** The planner's instructions: a JSON scene for this product, physically correct, with the text rule stated. */
export function buildScenePlanPrompt(input: ScenePlanPromptInput): { system: string; user: string } {
  const refs = input.productNames.map((n) => n.trim()).filter(Boolean);
  const photos = Math.max(0, Math.min(input.photos ?? 0, refs.length));
  const productLine =
    photos > 0
      ? `The ${photos === 1 ? 'attached photo shows' : `${photos} attached photos show`} the actual products shown in the post, in this order: ${refs.slice(0, photos).join('; ')}.`
      : refs.length > 0
        ? `The actual products shown in the post: ${refs.join('; ')}.`
        : 'No product list is available; use the kind of item the title names.';
  return {
    system:
      'You plan the one photograph that heads a business blog post about promotional products. You know how real products are used and photographed: a magnet is on a refrigerator or a filing cabinet, a koozie is around a can, a lanyard is around a neck, a tote is carried or on a counter, a pen is on paper. You answer with ONE JSON object and nothing else.',
    user: [
      `Blog post title: "${input.title.trim()}"`,
      `Topic: ${input.topic.trim()}`,
      productLine,
      'Describe a realistic scene where this product is seen IN USE the way its buyer sees it, in a business or everyday setting. Rules:',
      '- The placement must be physically possible for THIS product (a magnet holds only on steel; a koozie goes around a can, not beside it; a shirt is worn or folded).',
      '- No brand name, logo, wordmark, company name, phone number, web address or slogan anywhere, on the product or in the background; the product is a blank sample of its kind.',
      '- productText is the functional markings this kind of product carries by its nature, as generic placeholders: a measuring scale with its numbers and units, the numerals of a clock face, a calendar grid with months and dates, the day letters of a pill box, the lines of a notebook, or the standard designation a product carries by regulation or convention (FIRST AID with a cross, SPF and a number). Write "none" when the product carries none.',
      '- The things around the product must not need writing to be recognised: prefer tools, bowls, plants, fabric, food. No signs, banners, booths, screens, name plates, awards, labelled packaging or book and magazine covers; a book or paper, if any, is open to pages too small to read.',
      PLANNER_DEVICE_RULE,
      ARRANGEMENT_RULE,
      ...(photos > 0
        ? [
            ARRANGEMENT_FROM_PHOTOS_RULE,
            `- photos: the numbers (1 to ${photos}, in the order attached) of the photos whose product the arrangement shows; usually ONE number, never more than ${MAX_PHOTOS_PER_PICTURE}. Only those photos are given to the artist.`,
          ]
        : []),
      `Return exactly: {"surface": "what the product sits on or is attached to", "setting": "the room or place", "people": "none, or who and where, out of focus", "around": ["2 to 4 things around it"], "productText": "generic text that belongs on the product, or none", "arrangement": "how many of the product and in what state, one sentence", "photos": [${photos > 0 ? 'the photo numbers the arrangement shows' : ''}], "avoid": "what would be physically wrong for this product"}`,
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
    arrangement: scrubArrangement(cleanLine(r.arrangement, 300)),
    photos: (Array.isArray(r.photos) ? r.photos : [])
      .map((p) => (typeof p === 'number' ? p : typeof p === 'string' ? Number.parseInt(p, 10) : Number.NaN))
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= 20)
      .filter((p, i, all) => all.indexOf(p) === i)
      .slice(0, MAX_PHOTOS_PER_PICTURE),
    avoid: cleanLine(r.avoid),
  };
}

/**
 * The planner's arrangement with every clause (split on commas and
 * semicolons) that names a brand, a logo, an imprint or a contact detail
 * dropped ("one closed multi-tool, logo side up" keeps "one closed
 * multi-tool"). Unlike `scrubProductText`, a dropped clause does not take the
 * rest with it: the count and the state are what matter here. Empty when
 * nothing is left, and the image prompt then carries DEFAULT_ARRANGEMENT.
 *
 * Its OWN word list, narrower than FORBIDDEN_TEXT_WORDS on purpose: an
 * arrangement names the product, and the product may be a phone wallet, a
 * phone stand, a contact lens case or an address book. With the shared list
 * the measured plans for phone wallets and phone stands came out empty or cut
 * to "folded position." (AUTO-207, caught on the planner measurement), because
 * the bare word "phone" is on that list for "phone number".
 */
export const ARRANGEMENT_FORBIDDEN_WORDS: readonly string[] = [
  'logo', 'brand', 'branded', 'branding', 'wordmark', 'trademark', 'monogram', 'imprint', 'imprinted', 'company name', 'business name',
  'slogan', 'tagline', 'phone number', 'telephone number', 'web address', 'website', 'url', 'email', 'e-mail',
];

function arrangementClauseForbidden(clause: string): boolean {
  return ARRANGEMENT_FORBIDDEN_WORDS.some((w) => new RegExp(`\\b${w.replace(/[-/]/g, '\\$&')}(?:s|es)?\\b`, 'i').test(clause));
}

export function scrubArrangement(text: string): string {
  const raw = cleanLine(text, 300);
  if (!raw) return '';
  const kept = raw
    .split(/\s*[,;]\s*/)
    .map((c) => c.trim())
    .filter((c) => c && !arrangementClauseForbidden(c));
  return kept.join(', ').trim();
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

/**
 * The reference photos are catalogue photos of brand-name goods as often as
 * not, and the model copies what it is shown (AUTO-205 Part 4, brand defence
 * 1): the live koozies post's header carries four invented emblems and small
 * side tags lettered like the KOOZIE tag, because its four reference photos
 * were Koozie-brand products. So the prompt says, every time references are
 * sent, that tags, labels, logos and lettering on the references are not part
 * of the design.
 */
export const REFERENCE_TAG_RULE =
  'The reference photos are catalogue photographs and may show a maker\'s tag, a sewn-on or printed label, a logo, an emblem or lettering on the product: none of that is part of the design. Render every item completely blank: no tag, no label, no logo, no emblem, no lettering, no stitched or printed mark of any kind, and copy no symbol from the references.';

/** What may not be written anywhere but in the product's own markings (AUTO-204): display text, on the product or off it. */
const NO_OTHER_WRITING =
  'No other writing anywhere: no labels, signs, name plates, price tags, titles on books or magazines, screens with writing, writing in the background, and no word, name or message printed or engraved on the product as decoration. A book or paper in the scene shows only pages too small to read.';

/**
 * Devices are where a real maker's mark gets drawn (AUTO-204): three of the
 * fifteen pictures measured carry an Apple mark on a laptop lid that nobody
 * asked for (the wall clocks, AUTO-202's pedometers, the first probe), and
 * NO_BRAND_RULE, which names laptops, did not stop any of them. So the scene
 * has no device unless the plan calls for one.
 */
/**
 * AUTO-205 Part 4, brand defence 2: the rule is now absolute. AUTO-204's
 * wording allowed a device "the product is used with", and the AUTO-205
 * diagnostic found a brand mark on a laptop, a monitor or a phone in two of
 * six fresh pictures, every one of them passed by the check; a picture that
 * shows a device is refused by the check (`imageCheckProblem`) whatever the
 * product, so the prompt asks for none.
 */
const NO_DEVICES_RULE =
  'No laptops, computers, monitors, tablets or phones anywhere in the scene, not even partly visible or in the background, and not even when the product is used with one: show the product on its own or with non-electronic items. A picture with any such device in it will be rejected.';

/** The no-brand rule, stated once. */
const NO_BRAND_RULE =
  'No logos, brand marks, trademarks, brand names, company names, phone numbers, web addresses or slogans on anything, including on background objects such as laptops, phones, tablets, cups, bottles, bags, shoes or clothing. Where a logo or a company name would be printed, leave the area blank or use a plain abstract shape with no brand meaning.';

/**
 * The arrangement used when the planner gave none (it failed, or answered
 * with nothing usable), so the count and state rule never lapses (AUTO-207:
 * the check must be no weaker, and the picture no busier, without a plan).
 */
export const DEFAULT_ARRANGEMENT =
  'One to three of the product, large in the frame; anything that folds, slides or opens is shown closed, with at most one item open; a kit or a set is shown as one closed case.';

/** The image prompt's half of the count and state rule (AUTO-206's wording), carrying the arrangement. */
export function arrangementLine(arrangement: string, withReferences: boolean): string {
  const a = arrangement.trim() || DEFAULT_ARRANGEMENT;
  const sentence = /[.!?]$/.test(a) ? a : `${a}.`;
  return `- Show exactly this and no more: ${sentence} Each item is one complete, real, manufacturable object, drawn the way ${withReferences ? 'the reference photos show it' : 'such a product really is'}: every part attached where it really attaches, no part coming out of mid air, no extra blades, handles, rings or buttons, nothing fused or duplicated. Fewer, larger, simpler objects are better than many. If this kind of product carries a printed scale or dial, show it readable on ONE item only, with a few large graduations in correct ascending order; turn any other item so its scale is not visible.`;
}

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
  // AUTO-207: with no plan, the setting no longer suggests "a trade show
  // table, an event tent" (AUTO-206's planless tote picture put two banners
  // reading TRADE behind the bags); it asks for a plain place and props that
  // carry no writing, as the planner is told to.
  const placement = scene
    ? `Show ${what} in use, where such a product really lives: ${scene.surface}${scene.setting ? `, in ${scene.setting}` : ''}.${scene.around.length > 0 ? ` Around it: ${scene.around.join(', ')}.` : ''} People: ${scene.people || 'none'}.`
    : `Show ${what}, blank and unbranded, arranged in a clean, realistic setting where such a product is really used (a desk, a counter, a shelf or a workbench), with a few ordinary objects that carry no writing (a plant, a mug, fabric, tools). No signs, banners, booths, posters or screens anywhere in the scene.`;
  if (refs.length > 0) {
    lines.push(
      `The attached ${refs.length === 1 ? 'photo is' : `${refs.length} photos are`} the actual products the post recommends (${refs.join('; ')}). Use ${refs.length === 1 ? 'it' : 'them'} as the reference for what the items look like: their shape, materials, proportions and colours, as the photos show them (the names are catalogue names, and a tier or model word in a name is not a material or a colour). The number of photos is not the number of items to draw. ${REFERENCE_TAG_RULE} ${placement}`,
    );
  } else {
    lines.push(placement);
  }
  lines.push('Rules, every one of them strict:');
  lines.push(arrangementLine(scene?.arrangement ?? '', refs.length > 0));
  if (scene && scene.productText) {
    lines.push(
      `- The ONLY text allowed in the image is this product's own functional markings, the kind in the reference photos: ${scene.productText}. Render them as readable generic placeholder content (real-looking numbers, units, months, dates or lines), never a brand name, a company name, a phone number, a web address, a slogan or a claim. ${NO_OTHER_WRITING}`,
    );
  } else {
    lines.push(
      `- No words anywhere in the image. If this kind of product carries functional markings by its nature (a measuring scale, numerals, units, a dial face), draw only those, plain and generic; add no other letters or numbers. ${NO_OTHER_WRITING}`,
    );
  }
  lines.push(`- ${NO_BRAND_RULE}`);
  lines.push(`- ${NO_DEVICES_RULE}`);
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
      `The previous attempt was rejected because it contained ${input.previousProblem.trim()}. Compose the scene again with none of that: no brand marks, no tags or labels, no company names, no contact details, no laptop, monitor, tablet or phone anywhere, no writing except the product's own functional markings, and the product only where it could really be.`,
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

/** What kind of text a listed piece is; see "WHAT TEXT A PICTURE MAY CARRY" in the header. */
export type ImageTextKind = 'marking' | 'page' | 'display' | 'brand';

export const IMAGE_TEXT_KINDS: readonly ImageTextKind[] = ['marking', 'page', 'display', 'brand'];

/** One readable piece of text in a generated picture, as the vision model listed it. */
export interface ImageTextItem {
  /** What it says, as closely as it could be read. */
  text: string;
  /** The object it is on: "the measuring cups", "an open cookbook", "a plaque". */
  where: string;
  /** True when that object is the product the picture is about. */
  onProduct: boolean;
  kind: ImageTextKind;
}

/** A laptop, monitor, tablet or phone the check saw (AUTO-205 Part 4, brand defence 2). */
export interface ImageDeviceItem {
  what: string;
  where: string;
}

export interface ImageCheck {
  /** Every readable piece of text, each with its object and its kind. */
  texts: ImageTextItem[];
  /** False when the answer carried no usable list of texts. Such an answer REFUSES the picture: an unread picture is never passed. */
  listed: boolean;
  /** Every laptop, monitor, tablet or phone in the picture, however small or partial (AUTO-205); any one refuses it. */
  devices: ImageDeviceItem[];
  logo: boolean;
  logoSeen: string;
  /** A brand name, company name, phone number, web address, slogan or claim, in any text (AUTO-203's question, word for word). */
  brandText: boolean;
  brandTextSeen: string;
  /** The product somewhere it could not physically be (AUTO-203). */
  impossible: boolean;
  impossibleSeen: string;
}

/** What the check is told about the picture it is reading, so it knows which objects are "the product". */
export interface ImageCheckContext {
  /** The topic the post is written for ("promotional measuring cups"). */
  topic?: string | null;
  /** The reference products the picture was drawn from, when there were any. */
  productNames?: readonly string[];
  /** The planner's product text: a GUIDE to what the product carries, never the complete list. */
  productText?: string | null;
}

/**
 * How many times a generated picture is read back (AUTO-204). The reads run
 * in parallel and the WORST answer wins: a problem seen by any read refuses
 * the picture. One read is not enough: at temperature 0 the same wall clock
 * picture was passed by the read the old chain made and refused by seven of
 * the next eight, and the Apple logo on its laptop was seen by five reads of
 * nine. Each read is about a tenth of a cent (1,900 tokens in, 160 out) and
 * the reads cost no extra time. Two, not more: a FAINT mark (the laptop lid
 * in AUTO-202's pedometers picture) was seen by 2 reads of 12, so a third
 * read buys little; the remedy for those is upstream, NO_DEVICES_RULE.
 */
export const IMAGE_CHECK_READS = 2;

/** Entries the check is asked for at most, most prominent first (the answer must fit its token budget whole). */
export const IMAGE_CHECK_MAX_TEXTS = 8;

/**
 * The vision model's instructions for reading a generated picture back.
 * Questions 2, 3 and 4 (logo, brand text, impossible placement) are
 * AUTO-203's, word for word: the forbidden list did not move in AUTO-204.
 * Question 1 replaces the old "any readable text?" and "text other than on
 * the product?" pair with a list the code can judge.
 */
export function buildImageCheckPrompt(context: ImageCheckContext = {}): { system: string; user: string } {
  const topic = context.topic?.trim();
  const names = (context.productNames ?? []).map((n) => n.trim()).filter(Boolean);
  const productText = context.productText?.trim();
  const about = topic
    ? `This picture is about ${topic}${names.length > 0 ? ` (the products shown are like: ${names.join('; ')})` : ''}. Every item of that kind in the picture is "the product".`
    : 'The main items the picture shows are "the product".';
  return {
    system:
      'You inspect images before they are published on a business website. You answer with ONE JSON object and nothing else. Be literal: report what is visibly there, do not guess at intent.',
    user: [
      'Look at this image carefully, including the background, and answer:',
      about,
      `1. List every piece of READABLE text in the image: letters, numbers, words, including text that is small, out of focus or in the background (on a banner, a sign, a booth, a wall, a poster or packaging) whenever its letters can still be made out. One entry per distinct piece; put a run of similar markings (all the numbers of one scale, all the numerals of one dial) in ONE entry; at most ${IMAGE_CHECK_MAX_TEXTS} entries, the most prominent first. Decorative patterns, blank labels and scribbles too blurred to be letters are not text and are not listed. For each entry give "text" (what it says, as closely as you can read it), "where" (the object it is on), "onProduct" (true when that object is the product, false for anything else) and "kind", exactly one of:`,
      '   "brand": it reads as a brand, company, business, product or person name, a phone number, a web or email address, a slogan, a marketing claim, a price or an offer, real or invented.',
      '   "marking": functional markings an object carries by its nature: a measuring scale with its numbers and units, the numerals of a clock or dial, a display readout, key or button labels, the months, weekdays and dates of a calendar, day-of-the-week labels, a size or capacity label, the standard designation a product carries by regulation or convention (FIRST AID with a cross on a first aid kit, SPF and a number on sunscreen), and the plain name of what a kit\'s contents are (GAUZE PAD, BANDAGES, ANTISEPTIC WIPES).',
      '   "page": small running text or handwriting on the page of an open book, notebook, document or newspaper, too small to be a title or a heading.',
      '   "display": any other words: a title, heading, cover, label, packaging, sign, banner, poster, screen, name plate, badge, tag, print on clothing, or a word, name or message printed or engraved on an object as decoration.',
      '   A name, a message or a phone number beside a scale or a calendar is its own entry, never part of the marking.',
      productText ? `   The product is expected to carry: ${productText}. That is a guide, not the complete list: other functional markings of the same nature are markings too.` : '   The product may carry functional markings of its own even though none were described in advance.',
      '2. Is there any LOGO, brand mark, trademark or recognisable brand design anywhere, including on laptops, phones, cups, bottles, bags, shoes or clothing in the background? A blank imprint area or an abstract shape with no brand meaning is not a logo.',
      '3. Does any text read as a BRAND NAME, a company or business name, a phone number, a web address, an email address, a slogan or a marketing claim, real or invented? Generic placeholder content (month names, dates, numbers on a ruler, lines on a page) is not a brand.',
      '4. Is the main product somewhere it could not physically be, or used in a way it could not be used (a magnet stuck to wood or glass, a can cooler standing beside the can instead of around it, a wall clock lying on a table as if it were a plate)?',
      '5. List every LAPTOP, computer, MONITOR, TABLET or PHONE visible anywhere in the image, including partly visible ones and ones in the blurred background, each as "what" (laptop, monitor, tablet or phone) and "where". A keyboard, a mouse, a watch or earbuds are not listed. An empty list when there is none.',
      'Return exactly: {"texts": [{"text": "...", "where": "...", "onProduct": true or false, "kind": "brand" or "marking" or "page" or "display"}], "logo": true or false, "logoSeen": "which logo or brand and on what, or an empty string", "brandText": true or false, "brandTextSeen": "the brand, company, phone, address or slogan text, or an empty string", "impossible": true or false, "impossibleSeen": "what is physically wrong, or an empty string", "devices": [{"what": "laptop or monitor or tablet or phone", "where": "..."}]}. Use an empty list for "texts" when there is no readable text and an empty list for "devices" when there is no such device.',
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

/**
 * A phone number, a web address or an email address in a piece of text,
 * decided in CODE (AUTO-204): the one part of the forbidden list a pattern
 * can see, so it does not rest on the kind the model chose. "555-0100",
 * "(850) 200-4020", "1-800-...", "www.", "something.com", "a@b.co". A scale
 * ("100 200 300"), a date or a year matches none of them.
 */
export function looksLikeContactDetail(value: string): boolean {
  const t = value.toLowerCase();
  if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(t)) return true;
  if (/\(\d{3}\)\s*\d{3}/.test(t)) return true;
  if (/\b1[-.\s]8(00|88|77|66|55|44|33)\b/.test(t)) return true;
  if (/\b\d{3}[-.]\d{4}\b/.test(t)) return true;
  if (/\bwww\.|https?:\/\/|\b[a-z0-9-]+\.(com|net|org|biz|info|io|co|us)\b/.test(t)) return true;
  if (/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/.test(t)) return true;
  return false;
}

/**
 * STANDARD DESIGNATIONS (AUTO-207). A first-aid kit says FIRST AID by
 * convention, sunscreen says SPF 30, a gauze wrapper says GAUZE PAD 3IN X 3IN:
 * the product's own text, which AUTO-204's rule allows, yet AUTO-206 saw the
 * check refuse 4 of 4 first-aid pictures for exactly those words ("First
 * Aid", "First Aid Cream", "GAUZE PAD", "3IN X 3IN"), filed as `display`, so
 * the whole class fell to the product photo on every post. The check prompt
 * now names the designation as a marking, and THIS closed list is the belt in
 * code: a `display` entry made ENTIRELY of these phrases (and of numbers that
 * carry a unit) is a marking, whatever kind the model chose.
 *
 * Whole PHRASES, not loose words, on purpose: "SAFETY FIRST" is a slogan and
 * must stay refused, so "safety" is not on the list; "FIRST AID ONLY" is a
 * real brand and stays refused because "only" is not. A `brand` entry, a
 * contact detail found in code, and a "yes" to the brand question still
 * refuse exactly as before: this widens what `display` may hold and touches
 * nothing in the forbidden list. The classes are the catalogue's measured
 * ones (first-aid kits 30 products, sunscreen and lip balm 23, hand sanitizer
 * 20, hot and cold packs 17, emergency kits 8), plus the four regulatory
 * sign words.
 */
export const STANDARD_DESIGNATIONS: readonly string[] = [
  'first aid', 'first aid kit', 'first aid cream', 'gauze', 'gauze pad', 'gauze pads', 'bandage', 'bandages',
  'adhesive bandage', 'adhesive bandages', 'antiseptic', 'antiseptic wipe', 'antiseptic wipes', 'antibiotic', 'alcohol prep pad', 'alcohol prep pads',
  'alcohol wipe', 'alcohol wipes', 'antibiotic ointment', 'burn gel', 'sterile', 'instant cold pack', 'cold pack',
  'hot cold pack', 'hot cold', 'sunscreen', 'spf', 'broad spectrum', 'lip balm', 'hand sanitizer', 'sanitizer',
  'emergency', 'emergency kit', 'exit', 'fire extinguisher', 'caution', 'warning', 'aed',
];

const DESIGNATION_UNITS = new Set(['in', 'inch', 'inches', 'x', 'oz', 'fl', 'ml', 'mm', 'cm', 'ft', 'lb', 'lbs', 'g', 'kg', 'l', 'ct', 'pc', 'pcs', 'mah', '%', 'cup', 'cups', 'tbsp', 'tsp', 'qt', 'pt', 'gal']);
const BARE_NUMBER = /^\d+(?:[.,/]\d+)?$/;
const NUMBER_WITH_UNIT = /^\d+(?:[.,/]\d+)?(?:in|oz|ml|mm|cm|ft|lb|lbs|g|kg|ct|mah|%)$/;
const DESIGNATION_WORDS = STANDARD_DESIGNATIONS.map((p) => p.split(' '));

/**
 * True when a piece of text is a standard designation, a size or capacity
 * label, or both ("FIRST AID", "GAUZE PAD 3IN X 3IN", "SPF 30", "32 OZ").
 * Bare numbers with no unit are NOT (a phone number fragment such as
 * "555 0100" must stay refused), and anything else in the text is not either.
 */
export function isStandardDesignation(value: string): boolean {
  const tokens = value
    .toLowerCase()
    .replace(/[&/+\-:,()]/g, ' ')
    .replace(/(\d)\s*%/g, '$1%')
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9%]+|[^a-z0-9%]+$/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const words: string[] = [];
  let numbers = 0;
  let units = 0;
  for (const t of tokens) {
    if (NUMBER_WITH_UNIT.test(t)) {
      numbers += 1;
      units += 1;
    } else if (BARE_NUMBER.test(t)) numbers += 1;
    else if (DESIGNATION_UNITS.has(t)) units += 1;
    else words.push(t);
  }
  if (words.length === 0) return numbers > 0 && units > 0;
  // Every remaining word must belong to a listed phrase, longest phrase first.
  let i = 0;
  while (i < words.length) {
    let matched = 0;
    for (const phrase of DESIGNATION_WORDS) {
      if (phrase.length > matched && phrase.every((w, k) => words[i + k] === w)) matched = phrase.length;
    }
    if (matched === 0) return false;
    i += matched;
  }
  return true;
}

/**
 * The model's answer read defensively. FAIL CLOSED on the list: `texts` that
 * is missing or not a list leaves `listed` false, which refuses the picture,
 * and an entry whose kind is not one of the four reads as `display`, the
 * refused kind. A missing boolean still reads as "not seen", as before.
 */
export function parseImageCheck(raw: unknown): ImageCheck {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const listed = Array.isArray(r.texts);
  const texts: ImageTextItem[] = [];
  if (Array.isArray(r.texts)) {
    for (const entry of r.texts.slice(0, 20)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const said = text(e.text);
      const where = text(e.where);
      if (!said && !where) continue;
      const kind = typeof e.kind === 'string' ? e.kind.trim().toLowerCase() : '';
      texts.push({
        text: said,
        where,
        onProduct: bool(e.onProduct),
        kind: (IMAGE_TEXT_KINDS as readonly string[]).includes(kind) ? (kind as ImageTextKind) : 'display',
      });
    }
  }
  const devices: ImageDeviceItem[] = [];
  if (Array.isArray(r.devices)) {
    for (const entry of r.devices.slice(0, 20)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const what = text(e.what).toLowerCase();
      if (!what) continue;
      // Only the four the rule names count; a keyboard or a watch the model listed anyway does not.
      if (!/laptop|computer|monitor|screen|tablet|ipad|phone/.test(what)) continue;
      devices.push({ what, where: text(e.where) });
    }
  }
  return {
    texts,
    listed,
    devices,
    logo: bool(r.logo),
    logoSeen: text(r.logoSeen),
    brandText: bool(r.brandText),
    brandTextSeen: text(r.brandTextSeen),
    impossible: bool(r.impossible),
    impossibleSeen: text(r.impossibleSeen),
  };
}

/** The check answer for a read whose reply could not be parsed at all: nothing listed, so the picture is refused. */
export const UNREADABLE_IMAGE_CHECK: ImageCheck = {
  texts: [],
  listed: false,
  devices: [],
  logo: false,
  logoSeen: '',
  brandText: false,
  brandTextSeen: '',
  impossible: false,
  impossibleSeen: '',
};

/** `"the words" on the object`, for a refusal sentence. */
function quoted(items: readonly ImageTextItem[]): string {
  return items
    .slice(0, 3)
    .map((i) => `${i.text ? `"${i.text}"` : 'words'}${i.where ? ` on ${i.where.replace(/^on\s+/i, '')}` : ''}`)
    .join(', ');
}

/**
 * Why a checked picture is refused, or null when it passes. The rule, and
 * the whole of it: a logo, a brand or company name or a contact detail
 * (the model's own answer, a listed `brand` entry, or a phone number or web
 * address found in any listed text), display text on anything, an impossible
 * placement, or an answer with no usable list. Markings and page text pass
 * wherever they are. There is no "what the planner allowed" argument any
 * more (AUTO-204): the product's own markings pass whether or not the
 * planner predicted them.
 */
export function imageCheckProblem(check: ImageCheck): string | null {
  const problems: string[] = [];
  if (check.logo) problems.push(`a logo or brand mark${check.logoSeen ? ` (${check.logoSeen})` : ''}`);
  const brandItems = check.texts.filter((t) => t.kind === 'brand' || looksLikeContactDetail(t.text));
  if (check.brandText || brandItems.length > 0) {
    const seen = check.brandTextSeen ? `"${check.brandTextSeen}"` : quoted(brandItems);
    problems.push(`a brand, company name or contact detail in text${seen ? ` (${seen})` : ''}`);
  }
  // AUTO-207: a standard designation or size label filed as display is a marking (see STANDARD_DESIGNATIONS).
  const display = check.texts.filter((t) => t.kind === 'display' && !brandItems.includes(t) && !isStandardDesignation(t.text));
  const onProduct = display.filter((t) => t.onProduct);
  const offProduct = display.filter((t) => !t.onProduct);
  if (onProduct.length > 0) problems.push(`words printed on the product that are not its own markings (${quoted(onProduct)})`);
  if (offProduct.length > 0) problems.push(`words on a sign, a label, a cover or a screen (${quoted(offProduct)})`);
  // AUTO-205 Part 4, brand defence 2: any laptop, monitor, tablet or phone.
  // (A rule refusing a marking whose sequence is out of order was built and
  // MEASURED here and does not ship: the vision model refused correct scales
  // and passed the jumbled one. See CLAUDE.md Section 23, AUTO-205 Part 5.)
  if (check.devices.length > 0) {
    const named = [...new Set(check.devices.map((d) => d.what))].slice(0, 3).join(', ');
    const where = check.devices[0]?.where ? ` (${check.devices[0].where})` : '';
    problems.push(`a ${named} in the scene${where}`);
  }
  if (check.impossible) problems.push(`the product somewhere it could not be${check.impossibleSeen ? ` (${check.impossibleSeen})` : ''}`);
  if (!check.listed && problems.length === 0) problems.push('text the check could not account for');
  return problems.length > 0 ? problems.join(' and ') : null;
}

/**
 * Several reads of one picture, judged together (AUTO-204): the first
 * refusal among them, or null when every read passes. Reads that were
 * unavailable (null) are left out; the caller decides what no read at all
 * means.
 */
export function worstImageCheckProblem(checks: readonly (ImageCheck | null)[]): string | null {
  for (const check of checks) {
    if (!check) continue;
    const problem = imageCheckProblem(check);
    if (problem) return problem;
  }
  return null;
}

// -- The tile pass (AUTO-205 Part 4, brand defence 3) -----------------------------

/**
 * The six regions of a picture the tile pass reads, one call each, on the
 * SAME full-size bytes: the model is told to look only at one cell of a
 * 3 x 2 grid. The AUTO-205 diagnostic measured enlarged crops catching 5 of 6
 * faint marks the whole-picture reads missed; measured here (2026-10-12) on
 * the same marked pictures, the region question with NO cropping caught the
 * same 5 of 6 (the koozie tags, the USB bezel, three Apple lids) with 0 false
 * refusals on 7 clean pictures, so no image library is needed. The sixth
 * (the monitor mark on the phone stands picture) is caught by the device
 * rule. About 1,290 prompt tokens and 16 output tokens a call, six calls in
 * parallel, about 3.5 s and a quarter of a US cent per picture.
 */
export const TILE_REGIONS: readonly string[] = ['top-left', 'top-middle', 'top-right', 'bottom-left', 'bottom-middle', 'bottom-right'];

export function buildTileCheckPrompt(region: string): { system: string; user: string } {
  return {
    system:
      'You inspect images before they are published on a business website. You answer with ONE JSON object and nothing else. Be literal: report what is visibly there, do not guess at intent.',
    user: `Divide this photograph into a grid of 3 columns and 2 rows and look ONLY at the ${region} cell, as closely as you can, as if it were enlarged. Is there any LOGO, brand mark, trademark symbol, emblem or brand tag visible in that cell, however small or faint, on any object (laptop lid, phone, monitor, cup, bottle, bag, clothing, packaging, a sewn-on or printed tag)? An apple shape, a swoosh, a monogram, a crest and a wordmark all count. A plain blank surface, a reflection or a shadow is not a logo. Return exactly: {"logo": true or false, "seen": "what and on what, or an empty string"}`,
  };
}

export interface TileCheck {
  region: string;
  logo: boolean;
  seen: string;
}

export function parseTileCheck(region: string, raw: unknown): TileCheck {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { region, logo: bool(r.logo), seen: text(r.seen) };
}

/** Why the tile pass refuses a picture, or null: any region that saw a logo. Unavailable regions (null) are left out. */
export function tilePassProblem(tiles: readonly (TileCheck | null)[]): string | null {
  const hits = tiles.filter((t): t is TileCheck => t !== null && t.logo);
  if (hits.length === 0) return null;
  const seen = hits
    .slice(0, 2)
    .map((t) => (t.seen ? `${t.seen}, ${t.region}` : t.region))
    .join('; ');
  return `a small logo or brand tag the close look found (${seen})`;
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

/** What the header image is, with no label and no full stop: the part every surface words the same. */
export function headerImageWhat(outcome: HeaderImageOutcome): string {
  if (outcome.kind === 'asset' && outcome.source === 'ai') return "generated by the AI from the post's product photos";
  if (outcome.kind === 'asset') return 'a picture from the header image library';
  if (outcome.kind === 'url') return "the post's first product photo, shown from Geiger's image server";
  return 'none';
}

/**
 * The notes as plain sentences, each said ONCE (AUTO-204): what went wrong on
 * the way to this picture. Empty when there is nothing to say. The Studio
 * dialogs print this and nothing else about the reasons; before AUTO-204 the
 * same explanation was printed inside the summary's brackets and again under
 * a "Note:" heading.
 */
export function headerImageWhy(outcome: Pick<HeaderImageOutcome, 'notes'>): string {
  return outcome.notes
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => `${n.charAt(0).toUpperCase()}${n.slice(1)}${/[.!?]$/.test(n) ? '' : '.'}`)
    .join(' ');
}

/** One line for the panel and the Studio dialogs: what the image is, then why, in sentences. */
export function headerImageSummary(outcome: HeaderImageOutcome): string {
  const why = headerImageWhy(outcome);
  const tail = outcome.kind === 'none' ? ' Upload one, or press Generate header image on the draft.' : '';
  return `Header image: ${headerImageWhat(outcome)}.${why ? ` ${why}` : ''}${tail}`;
}

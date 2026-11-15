/**
 * Brand screening for the header picture (AUTO-220). PURE: the matching rule,
 * the two prompts and their parsers; no network, no Sanity, no next/*.
 *
 * WHY. CHECK-image-brief-26 measured a real national brand on 12 of 35
 * pictures. Two different things put it there:
 *   (a) the supplier's catalogue photo carries a real customer's logo as its
 *       sample imprint, and the model copies it legibly every time (DELTA 7 of
 *       7, Virgin Mobile 4 of 4, Sprint 1 of 1);
 *   (b) the model garbles an invented sample imprint INTO a real one: the pen
 *       photo says DURAFLOW and the picture said DUNLOP, DULUTH TRADING and
 *       DULUTH. Nobody gave permission for those; they were never in a photo.
 *
 * TWO WAYS A NAME IS A HIT, in both layers that read:
 *   - a TEXT (an imprint, a caption) is a hit only when the LIST holds it;
 *   - a LOGO THE READER NAMES is a hit whether the list holds it or not
 *     (`namedLogoHit`). The reader is asked for real, widely known
 *     organisations it recognises and nothing else, and it is conservative:
 *     over the 35 archived pictures read twice and about 35 photo reads it
 *     named a logo 20 times, every one real (Virgin Mobile, Delta Air Lines,
 *     Dunlop, Sprint, Duluth Trading, Skullcandy, Instagram, Telemundo,
 *     Citrix, the NYPD, Texas Woman's University, Performa), and named none
 *     on the 23 pictures that carry no real mark. The stress toys sample is
 *     why: the list did not hold Telemundo, the reader named it on the photo
 *     AND on the finished picture, and the picture was accepted.
 *
 * THREE LAYERS, and what each one actually catches:
 *   1. BEFORE (`photoScreenVerdict`): every candidate reference photo is read
 *      by the vision model, and a photo whose imprint is on the list, or
 *      whose logo the reader names, is not sent. Catches (a) when the brand
 *      is on the list or the reader recognises it. Cannot catch (b): there is
 *      nothing wrong with the photo.
 *   2. IN THE PROMPT (header-brief.ts): rungs 2 and 3 say "the logos already
 *      printed on the products stay exactly as they are", and a retry after a
 *      brand hit names the offending name. Measured effect on garbling: none
 *      worth claiming (DURAFLOW came out right on 2 of 8 pens pictures, with
 *      and without the line). It costs nothing and is honest to keep, but it
 *      is not a guard.
 *   3. AFTER (`pictureBrandProblem`): every readable piece of text and every
 *      recognised logo is read back off the finished picture, twice; a hit
 *      redraws the picture ONCE. The only layer that can catch (b), and it
 *      catches it only when the garbled result is on the list or the reader
 *      recognises it. Measured on the 35 archived pictures with two reads
 *      each: all 12 that carry a real national brand were caught, and 4 of
 *      the 5 that carry the Florida Gators' cheer; none of the 18 with no
 *      real mark was refused. The list was written after seeing those
 *      pictures, so that is the reader's score, not the list's.
 *
 * WHAT NONE OF THEM CATCHES: a real organisation that is neither on the list
 * nor recognised by the reader (a regional bank, a hospital, a school, a
 * local firm; AUTO-209 Part 6 found most real imprints are exactly those:
 * AVIALL, a real aircraft parts company, went through on the same stress toys
 * picture, read correctly as text and recognised by nobody), text the reader
 * misses or misreads, and a logo with no words that the reader does not
 * recognise. The reads are not repeatable either: one Gators picture was
 * caught on one run and missed on the next. This REDUCES the problem.
 * It does not end it, and nothing here may be described as making a picture
 * safe to publish unseen.
 *
 * A PRODUCT'S OWN MAKER IS NOT A HIT. A Stanley bottle says STANLEY and a Bic
 * pen says BIC; that is the product. A name is allowed when it appears in the
 * catalogue brand or the name of one of the products sent, or in the post's
 * own title.
 */
import { KNOWN_BRANDS } from './brand-list';

/** Words of a text, lower case, accents and apostrophes removed, "&" read as "and". */
export function brandTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’‛`]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

interface BrandEntry {
  display: string;
  compact: string;
  /** True for a name that is also an ordinary word or a surname: it matches only as the whole text. */
  exact: boolean;
}

/** The longest run of words read together as one name ("u", "s", "cellular"). */
const MAX_WINDOW = 5;
/** A name this short is matched as ONE word only, never as words run together ("ni" + "ke"). */
const MIN_JOINED_LENGTH = 5;
/** Words that do not change whose name it is. */
const CORPORATE_TAIL = new Set(['inc', 'co', 'corp', 'corporation', 'company', 'llc', 'ltd']);

function buildIndex(names: readonly string[]): Map<string, BrandEntry> {
  const index = new Map<string, BrandEntry>();
  for (const raw of names) {
    const exact = raw.startsWith('=');
    const display = exact ? raw.slice(1) : raw;
    const compact = brandTokens(display).join('');
    if (!compact) continue;
    const prior = index.get(compact);
    // A name listed both ways is the looser of the two.
    index.set(compact, { display: prior?.display ?? display, compact, exact: prior ? prior.exact && exact : exact });
  }
  return index;
}

const BRAND_INDEX = buildIndex(KNOWN_BRANDS);

/** How many names the list holds, for the report and the tests. */
export const KNOWN_BRAND_COUNT = BRAND_INDEX.size;

function trimmedTokens(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  if (tokens[start] === 'the') start += 1;
  while (end > start && CORPORATE_TAIL.has(tokens[end - 1])) end -= 1;
  return tokens.slice(start, end);
}

/** Every listed name a run of the text's words spells, with whether the run is the whole text. */
function matchesIn(text: string): { entry: BrandEntry; whole: boolean }[] {
  const tokens = trimmedTokens(brandTokens(text));
  const out: { entry: BrandEntry; whole: boolean }[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let joined = '';
    for (let len = 1; len <= MAX_WINDOW && i + len <= tokens.length; len += 1) {
      joined += tokens[i + len - 1];
      const entry = BRAND_INDEX.get(joined);
      if (!entry) continue;
      if (len > 1 && joined.length < MIN_JOINED_LENGTH) continue;
      out.push({ entry, whole: i === 0 && len === tokens.length });
    }
  }
  return out;
}

/** True when a listed name appears in one of the allowed texts (a product's own brand or name, the post's title). */
function allowedBy(entry: BrandEntry, allowed: readonly string[]): boolean {
  return allowed.some((a) => matchesIn(a).some((m) => m.entry.compact === entry.compact));
}

export interface FindBrandOptions {
  /** Texts in which a brand is the product's own or the post's own: catalogue brand names, product names, the title. */
  allowed?: readonly string[];
  /**
   * For a logo the reader NAMED ("Apple logo on a laptop"): a name that is
   * also an ordinary word counts wherever it appears, because the reader was
   * asked for recognised company logos and nothing else.
   */
  lenient?: boolean;
}

/** The first well known brand a piece of text names, as the list spells it; null when it names none. */
export function findBrand(text: unknown, opts: FindBrandOptions = {}): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const allowed = (opts.allowed ?? []).filter((a) => typeof a === 'string' && a.trim());
  for (const m of matchesIn(text)) {
    if (m.entry.exact && !m.whole && !opts.lenient) continue;
    if (allowedBy(m.entry, allowed)) continue;
    return m.entry.display;
  }
  return null;
}

/** What a reader writes after a name that is not part of it ("Telemundo logo on the ball", "NYPD (New York Police Department)"). */
const AFTER_THE_NAME = /\s+(?:logo|logos|emblem|wordmark|symbol|icon|crest|badge|seal|swoosh|brand|mark)\b|\s+(?:on|in|at|from)\s+(?:a|an|the)\b|[,(;:]/i;
/** Words around a name that are not part of it. */
const LOGO_NOISE = new Set(['the', 'a', 'an', 'logo', 'logos', 'emblem', 'wordmark', 'symbol', 'icon', 'crest', 'badge', 'seal', 'brand', 'mark']);
/** What a reader writes when it has no name to give. */
const NOT_A_NAME = new Set(['unknown', 'unfamiliar', 'unidentified', 'unrecognised', 'unrecognized', 'generic', 'none', 'no', 'not', 'na', 'n', 'made', 'up', 'fictional', 'invented', 'sample', 'placeholder', 'custom', 'company', 'shield', 'leaf', 'star', 'circle', 'abstract', 'shape']);
/** Our own name is never a hit (the mark is stamped after the reads, but a reader may still name us from the products). */
const OWN_NAMES = ['Perfect Imprints'];
/** A name this short is not reported off the list: two letters are initials, not a recognition. */
const MIN_NAMED_LENGTH = 3;

/**
 * A logo the READER NAMED, as a hit: the list's spelling when the list holds
 * it, otherwise the name as the reader gave it, with whatever it wrote around
 * the name cut off. Null when the name is the product's own maker, the post's
 * own title or ours, or when the answer names nothing ("unknown logo").
 */
export function namedLogoHit(logo: unknown, allowed: readonly string[] = []): string | null {
  if (typeof logo !== 'string' || !logo.trim()) return null;
  const allow = [...allowed, ...OWN_NAMES].filter((a) => typeof a === 'string' && a.trim());
  const listed = findBrand(logo, { allowed: allow, lenient: true });
  if (listed) return listed;
  // On the list but allowed: the product's own maker. Not a hit, and not an unlisted name either.
  if (findBrand(logo, { lenient: true })) return null;
  const whole = logo.replace(/\s+/g, ' ').trim();
  const head = whole.split(AFTER_THE_NAME)[0].trim();
  const tokens = trimmedTokens(brandTokens(head || whole).filter((t) => !LOGO_NOISE.has(t)));
  if (tokens.length === 0 || tokens.some((t) => NOT_A_NAME.has(t))) return null;
  if (tokens.join('').length < MIN_NAMED_LENGTH) return null;
  const name = new Set(tokens);
  for (const a of allow) {
    const words = new Set(brandTokens(a));
    if (words.size === 0) continue;
    // The name is inside an allowed text (a product's name, the title), or an allowed maker is inside the name ("BIC" in "Bic Graphic").
    if (tokens.every((t) => words.has(t)) || [...words].every((w) => name.has(w))) return null;
  }
  return (head || whole).replace(/^(?:the|a|an)\s+/i, '').slice(0, 60);
}

function strings(value: unknown, max: number, maxLen = 160): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const t = v.replace(/\s+/g, ' ').trim().slice(0, maxLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// -- Layer 1: the reference photos ------------------------------------------------

/** What the vision model reports about one catalogue photo. */
export interface PhotoScreen {
  /** Every readable piece of writing in the photo. */
  imprints: string[];
  /** Logos of real, widely known organisations the reader recognised, by name. */
  logos: string[];
  /** What the reader says the product is and is used for (asked BEFORE `subject`, so the verdict follows from a description). */
  kind: string;
  /** Whether the product is the kind the post is about; null when the reader did not say. */
  subject: boolean | null;
}

export const PHOTO_SCREEN_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    imprints: { type: 'ARRAY', items: { type: 'STRING' } },
    logos: { type: 'ARRAY', items: { type: 'STRING' } },
    kind: { type: 'STRING' },
    subject: { type: 'BOOLEAN' },
  },
  required: ['imprints', 'logos', 'kind', 'subject'],
  propertyOrdering: ['imprints', 'logos', 'kind', 'subject'],
};

/**
 * The question asked of one catalogue photo. It also asks whether the product
 * is the post's SUBJECT (AUTO-220 Part 8): on the shaker bottles post the name
 * rule alone would have sent a spice shaker and a cocktail shaker, because all
 * three names say "shaker" and two say "bottle". Names cannot tell them
 * apart; the photo can. The example in the prompt is deliberately not that
 * case, so the proof on it is not the prompt reciting its own answer.
 */
export function buildPhotoScreenPrompt(input: { productName: string; title: string; topic: string }): { system: string; user: string } {
  const topic = input.topic.replace(/\s+/g, ' ').trim();
  return {
    system: 'You inspect catalogue photos for a promotional products company and report exactly what is in them. You list, you do not judge. Answer with ONE JSON object.',
    user: [
      `This is a catalogue photo of a product named "${input.productName.replace(/\s+/g, ' ').trim()}".`,
      `It may be used to illustrate a blog post titled "${input.title.replace(/\s+/g, ' ').trim()}"${topic ? ` (the post is about: ${topic})` : ''}.`,
      'Report:',
      '1. imprints: EVERY piece of readable writing in the photo, each as its own entry, copied exactly: the words of a logo printed on the product, a name, a slogan, a web address, a phone number, a tag. Include small writing. An empty list if there is none.',
      '2. logos: the name of any real, widely known company, brand, team or organisation whose logo or emblem you recognise in the photo, even where no name is written. An empty list if there is none. Do not guess: an unfamiliar or made-up logo is not listed.',
      '3. kind: what the product in the photo is and what it is used for, in a few words, from what the photo shows and not from its name (for example "a canvas tote bag for shopping", "an insulated lunch cooler").',
      '4. subject: true only when that is the kind of product the post is about, used for what the post is about. False when it is a different kind of product that only shares a word with the post\'s subject, or one used for something else (for a post about tote bags for trade shows: a tote bag is true; a wine bottle bag, a lunch cooler or a bag clip is false).',
    ].join('\n'),
  };
}

/** The reader's answer, read defensively. Null when it says nothing usable. */
export function parsePhotoScreen(raw: unknown): PhotoScreen | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { imprints?: unknown; logos?: unknown; kind?: unknown; subject?: unknown };
  if (!Array.isArray(r.imprints) && !Array.isArray(r.logos) && typeof r.subject !== 'boolean') return null;
  return {
    imprints: strings(r.imprints, 24),
    logos: strings(r.logos, 8, 80),
    kind: typeof r.kind === 'string' ? r.kind.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
    subject: typeof r.subject === 'boolean' ? r.subject : null,
  };
}

export interface PhotoVerdict {
  /** A well known brand the photo carries that is not the product's own; null when none was found. */
  brand: string | null;
  /** True when the reader said the product is not the post's subject. */
  offSubject: boolean;
  /** True when the reader said outright that the product IS the post's subject (false when it said no, or said nothing). */
  onSubject: boolean;
}

/**
 * Whether a photo may be sent. A photo that could not be read (`screen` null)
 * passes: layer 1 fails open, because layer 3 reads the finished picture and
 * refusing every photo when the reader is down would leave the model drawing
 * products out of its head.
 */
export function photoScreenVerdict(screen: PhotoScreen | null, product: { name: string; brand?: string | null }, title: string): PhotoVerdict {
  if (!screen) return { brand: null, offSubject: false, onSubject: false };
  const allowed = [product.name, product.brand ?? '', title];
  let brand: string | null = null;
  for (const text of screen.imprints) {
    brand = findBrand(text, { allowed });
    if (brand) break;
  }
  if (!brand) {
    for (const logo of screen.logos) {
      brand = namedLogoHit(logo, allowed);
      if (brand) break;
    }
  }
  return { brand, offSubject: screen.subject === false, onSubject: screen.subject === true };
}

// -- Layer 3: the finished picture ------------------------------------------------

/** Inventory reads of the finished picture, in parallel; the union of what they see is checked. */
export const PICTURE_INVENTORY_READS = 2;

export interface PictureInventory {
  texts: { text: string; where: 'title' | 'product' | 'other' }[];
  logos: string[];
}

export const PICTURE_INVENTORY_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    texts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, where: { type: 'STRING', enum: ['title', 'product', 'other'] } },
        required: ['text', 'where'],
      },
    },
    logos: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['texts', 'logos'],
  propertyOrdering: ['texts', 'logos'],
};

export function buildPictureInventoryPrompt(): { system: string; user: string } {
  return {
    system: 'You inspect marketing images and report exactly what is in them. You list, you do not judge. Answer with ONE JSON object.',
    user: [
      'This is a blog header picture for a promotional products company. Report:',
      '1. texts: EVERY piece of readable writing in the picture, each as its own entry, copied exactly, with "where" one of:',
      '   "title" (the headline of the picture),',
      '   "product" (printed, engraved or stitched on one of the products shown: a logo\'s words, a name, a slogan),',
      '   "other" (anything else: a caption, a label, a badge, a sign, a banner, a screen, packaging, clothing).',
      '   Include small and partly hidden writing.',
      '2. logos: the name of any real, widely known company, brand, team or organisation whose logo or emblem you recognise anywhere in the picture, even where no name is written (on a laptop lid, a phone, a shoe, a cup, a car). An empty list if there is none. Do not guess: an unfamiliar or made-up logo is not listed.',
    ].join('\n'),
  };
}

/** The reader's answer, read defensively. Null when it says nothing usable (the read is then counted as not made). */
export function parsePictureInventory(raw: unknown): PictureInventory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { texts?: unknown; logos?: unknown };
  if (!Array.isArray(r.texts)) return null;
  const texts: PictureInventory['texts'] = [];
  for (const t of r.texts) {
    const item = t as { text?: unknown; where?: unknown } | null;
    if (!item || typeof item.text !== 'string') continue;
    const text = item.text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) continue;
    const where = item.where === 'title' || item.where === 'product' ? item.where : 'other';
    texts.push({ text, where });
    if (texts.length >= 60) break;
  }
  return { texts, logos: strings(r.logos, 8, 80) };
}

export interface PictureBrandContext {
  /** The post's title: a brand the title itself names is the post's subject. */
  title: string;
  /** The products whose photos were sent (their own maker's name is allowed). */
  products: readonly { name: string; brand?: string | null }[];
}

/**
 * The well known brand a finished picture shows, or null. Every text of every
 * read is checked, the title's own words included (a caption mislabelled as
 * the title is still checked; a brand the real title names is allowed through
 * `title`). A logo the reader names is a hit listed or not. The first hit
 * wins; the name returned is the list's spelling, or the reader's own for a
 * name the list does not hold.
 */
export function pictureBrandProblem(reads: readonly (PictureInventory | null)[], context: PictureBrandContext): string | null {
  const allowed = [context.title, ...context.products.flatMap((p) => [p.name, p.brand ?? ''])];
  for (const read of reads) {
    if (!read) continue;
    for (const t of read.texts) {
      const hit = findBrand(t.text, { allowed });
      if (hit) return hit;
    }
    for (const logo of read.logos) {
      const hit = namedLogoHit(logo, allowed);
      if (hit) return hit;
    }
  }
  return null;
}

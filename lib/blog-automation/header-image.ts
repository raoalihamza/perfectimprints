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
 * THE HARD RULES, and how they are held. (1) No text anywhere: a model
 * rendering words renders wrong ones. (2) No logo or brand mark belonging to
 * anyone, INCLUDING ON BACKGROUND OBJECTS: the very first probe (2026-10-05)
 * drew five plain bottles perfectly and an Apple mark on a laptop behind
 * them, so the prompt names devices, cups and clothing explicitly. (3) No
 * product that is not in the references. The prompt states all three; then
 * EVERY generated picture is read back by the vision model with
 * `buildImageCheckPrompt` and a picture that shows readable text or a logo is
 * dropped (one retry with the problem named, then the next source), never
 * stored. The check cannot see "a product that does not exist"; that rule is
 * held by the references and by Patrick reading the draft, and the report
 * says so.
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
  /** Set on the one retry: what the check found in the previous attempt. */
  previousProblem?: string | null;
}

/** The prompt sent to the image model with the reference photographs. */
export function buildHeaderImagePrompt(input: HeaderImagePromptInput): string {
  const title = input.title.trim();
  const topic = input.topic.trim();
  const refs = input.productNames.filter((n) => n.trim());
  const lines: string[] = [];
  lines.push(`Create one wide (16:9) photograph-style header image for a business blog post titled "${title}".`);
  lines.push(
    `The post is about ${topic} for organizations that order promotional products in bulk: marketing directors, HR directors, safety managers and business owners.`,
  );
  if (refs.length > 0) {
    lines.push(
      `The attached ${refs.length === 1 ? 'photo is' : `${refs.length} photos are`} the actual products the post recommends (${refs.join('; ')}). Use ${refs.length === 1 ? 'it' : 'them'} as the reference for what the items look like: their shape, materials, proportions and colours. Show items like these, blank and unbranded, arranged in a clean, realistic setting a marketing or HR manager would recognise, for example an office desk, a trade show table, an event tent, a company picnic or a reception counter.`,
    );
  } else {
    lines.push(
      `Show the kind of item the title names, blank and unbranded, arranged in a clean, realistic setting a marketing or HR manager would recognise, for example an office desk, a trade show table, an event tent, a company picnic or a reception counter.`,
    );
  }
  lines.push('Rules, every one of them strict:');
  lines.push('- No text anywhere in the image: no letters, numbers, words, labels, signs, price tags, screens with writing or writing in the background.');
  lines.push(
    '- No logos, brand marks, trademarks or recognisable brand designs on anything, including on background objects such as laptops, phones, tablets, cups, bottles, bags, shoes or clothing. Where a logo would be printed, leave the area blank or use a plain abstract shape with no brand meaning.',
  );
  if (refs.length > 0) {
    lines.push('- Show only products of the kinds in the reference photos. Do not add other promotional products and do not invent features, colours or details that are not in the references.');
  } else {
    lines.push('- Show only the kind of product the title names. Do not add other promotional products and do not invent features that such a product does not have.');
  }
  lines.push('- No close-up faces. People, if any, are in the background and out of focus.');
  lines.push('- Natural daylight, soft shadows, shallow depth of field, an editorial photography look. Not an illustration, not a collage, no borders, no frames, no watermark.');
  if (input.previousProblem?.trim()) {
    lines.push(`The previous attempt was rejected because it contained ${input.previousProblem.trim()}. Compose the scene again with none of that: no writing and no brand marks of any kind.`);
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
  readableText: boolean;
  textSeen: string;
  logo: boolean;
  logoSeen: string;
}

/** The vision model's instructions for reading a generated picture back. */
export function buildImageCheckPrompt(): { system: string; user: string } {
  return {
    system:
      'You inspect images before they are published on a business website. You answer with ONE JSON object and nothing else. Be literal: report what is visibly there, do not guess at intent.',
    user: [
      'Look at this image carefully, including the background, and answer:',
      '1. Is there any READABLE text anywhere: letters, numbers, words, a slogan, a label, a sign, a screen with writing, a price? Decorative patterns and blank labels are not text.',
      '2. Is there any LOGO, brand mark, trademark or recognisable brand design anywhere, including on laptops, phones, cups, bottles, bags, shoes or clothing in the background? A blank imprint area or an abstract shape with no brand meaning is not a logo.',
      'Return exactly: {"readableText": true or false, "textSeen": "the text you can read, or an empty string", "logo": true or false, "logoSeen": "which logo or brand, or an empty string"}',
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
  };
}

/** Why a checked picture is refused, or null when it passes. */
export function imageCheckProblem(check: ImageCheck): string | null {
  const problems: string[] = [];
  if (check.readableText) problems.push(`readable text${check.textSeen ? ` ("${check.textSeen}")` : ''}`);
  if (check.logo) problems.push(`a logo or brand mark${check.logoSeen ? ` (${check.logoSeen})` : ''}`);
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

/**
 * What the OpenAI image model is asked for, and how its answer is judged
 * (AUTO-220). PURE: no Sanity, no fs, no network, no next/*, so the Studio
 * bundle, the server chain and vitest share the same rules.
 *
 * THE LADDER. Ali's decision after CHECK-image-brief-26 (35 paid pictures,
 * 2026-11-10), settled and not to be reopened:
 *
 *   rung 1  the FIRST picture of every post: the bare prompt, Patrick's own
 *           two lines and nothing else. It draws the sunburst poster (bands,
 *           icons, captions) on 12 of 12, and invents wording on 11 of 12
 *           ("Bulk Discounts", "Cost Savings"). Ali has decided that wording
 *           is acceptable; there is NO rule against it and none may be added.
 *   rung 2  the first Generate again: the reworded poster. Three lines after
 *           Patrick's two, line 1 reworded so the poster stays (8 of 8) and
 *           the invented captions go (1 stray mark in 8).
 *   rung 3  the second Generate again: the instructed version. The three
 *           lines as the earlier ticket worded them, which turn the poster
 *           into a clean photograph with the title on it (15 of 15).
 *   then    the ladder repeats.
 *
 * The rung a picture was drawn on is stored on the image value
 * (`ladderRung`), so the next Generate again knows where the post is.
 *
 * THE MODEL DRAWS THE TITLE, code never does: the reverse of AUTO-209, which
 * was measured on a model that could not render text and on a brief that
 * forbade it. So a changed title means a new picture, and every picture is
 * read back: the title must read exactly (the gate below).
 *
 * THE WORDING IS MEASURED. Every line here is verbatim what the 35 pictures
 * were drawn from; change a word and the measurements no longer describe it.
 */

export type HeaderRung = 1 | 2 | 3;

export const HEADER_RUNGS: readonly HeaderRung[] = [1, 2, 3];

/** The ladder in its exact order; a test pins it. */
export const HEADER_LADDER: Readonly<Record<HeaderRung, 'bare' | 'poster' | 'instructed'>> = {
  1: 'bare',
  2: 'poster',
  3: 'instructed',
};

/** Plain words for the Studio dialog and the report. */
export const HEADER_RUNG_LABEL: Readonly<Record<HeaderRung, string>> = {
  1: 'the plain prompt (your two lines)',
  2: 'the poster look with the title as the only writing',
  3: 'a clean photograph with the title on it',
};

/** A stored rung read back; null for anything else (an older picture, an upload, nothing). */
export function rungOf(value: unknown): HeaderRung | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

/** The rung the NEXT picture is drawn on: 1 for a post with no rung yet, else the one after, round again after 3. */
export function nextRung(previous: unknown): HeaderRung {
  const p = rungOf(previous);
  if (p === null) return 1;
  return ((p % 3) + 1) as HeaderRung;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/** Patrick's own two lines (one when there is no product photo to attach). */
export function patrickLines(title: string, photos: number): string {
  const first = `Create a blog header image, "${cleanTitle(title)}"`;
  return photos > 0 ? `${first}\n\nUse the attached product photos in the image` : first;
}

/** Line 1 as CHECK-image-brief-26 reworded it: keeps the poster, drops the invented captions. */
export const POSTER_LINE_1 =
  'Make it a bold graphic header with colour bands and shapes, but the title is the only writing you add: no other headings, captions, labels, callouts, badges, tags or words under icons. The logos already printed on the products stay exactly as they are.';
/** Line 1 as the earlier ticket worded it: turns the poster into a clean photograph with the title on it. */
export const INSTRUCTED_LINE_1 =
  'The only words you add are the title. No other headings, captions, labels, callouts, badges or tags. The logos already printed on the products stay exactly as they are.';
export const NO_DEVICES_LINE = 'No laptops, tablets, phones or screens anywhere in the picture.';
export const SETTING_LINE = 'Put the products in the setting where they are really used, with a background that suits them.';

/** What a retry is told, after the two lines and the rung's block. */
export interface BriefRetry {
  /** The title did not read back exactly. */
  title?: boolean;
  /** A recognised brand name the previous picture showed. */
  brand?: string | null;
}

function retryLines(title: string, retry: BriefRetry | null | undefined): string[] {
  const out: string[] = [];
  if (retry?.title) out.push(`The title on the picture must read exactly, letter for letter: "${cleanTitle(title)}"`);
  const brand = retry?.brand?.replace(/\s+/g, ' ').trim();
  if (brand) {
    out.push(
      `The previous picture showed "${brand}". That name must not appear anywhere in the picture: where it was printed, leave the product plain. Every other logo printed on the products stays exactly as the photos show it, letter for letter.`,
    );
  }
  return out;
}

export interface HeaderBriefInput {
  title: string;
  rung: HeaderRung;
  /** How many product photos are attached. */
  photos: number;
  retry?: BriefRetry | null;
}

/** The prompt for one rung of the ladder. */
export function buildHeaderBrief(input: HeaderBriefInput): string {
  const parts = [patrickLines(input.title, input.photos)];
  if (input.rung === 2) parts.push([POSTER_LINE_1, NO_DEVICES_LINE, SETTING_LINE].join('\n'));
  if (input.rung === 3) parts.push([INSTRUCTED_LINE_1, NO_DEVICES_LINE, SETTING_LINE].join('\n'));
  const retry = retryLines(input.title, input.retry);
  if (retry.length > 0) parts.push(retry.join('\n'));
  return parts.join('\n\n');
}

// -- Patrick's own instruction ---------------------------------------------------

/** The longest instruction sent on; longer is cut at a word. */
export const MAX_INSTRUCTION_CHARS = 600;

/** The instruction as it is sent: one paragraph, trimmed, capped. Empty when there is nothing to send. */
export function cleanInstruction(value: unknown): string {
  if (typeof value !== 'string') return '';
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_INSTRUCTION_CHARS) return t;
  const cut = t.slice(0, MAX_INSTRUCTION_CHARS);
  const at = cut.lastIndexOf(' ');
  return (at > MAX_INSTRUCTION_CHARS * 0.6 ? cut.slice(0, at) : cut).trim();
}

/**
 * "Make a new picture" with Patrick's words: his instruction takes the place
 * of the ladder's block. Patrick's own two lines stay, because the title gate
 * still runs on the result and the model can only draw a title it was given.
 */
export function buildInstructionBrief(input: { title: string; instruction: string; photos: number; retry?: BriefRetry | null }): string {
  const parts = [patrickLines(input.title, input.photos), cleanInstruction(input.instruction)];
  const retry = retryLines(input.title, input.retry);
  if (retry.length > 0) parts.push(retry.join('\n'));
  return parts.filter(Boolean).join('\n\n');
}

/**
 * "Change this picture": the current picture is the one attached image, and
 * Patrick's words say what to change. The title line is there for the same
 * reason as above, and so that a title edited since the picture was made is
 * corrected by the same press.
 */
export function buildEditBrief(input: { title: string; instruction: string; retry?: BriefRetry | null }): string {
  const parts = [
    `Change the attached blog header image as follows: ${cleanInstruction(input.instruction)}`,
    `Keep everything else in the picture as it is. The title on the picture must read exactly: "${cleanTitle(input.title)}"`,
  ];
  const retry = retryLines(input.title, { brand: input.retry?.brand });
  if (retry.length > 0) parts.push(retry.join('\n'));
  return parts.join('\n\n');
}

/**
 * How many times in a row a picture may be changed. Every change redraws the
 * whole picture from the previous one, so small faults add up (a logo that
 * was copied well comes out a little softer each time). After this many the
 * Studio asks for a new picture instead.
 */
export const MAX_HEADER_EDITS_IN_A_ROW = 3;

/** How many changes in a row the stored picture already carries. */
export function editCountOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// -- The title gate ---------------------------------------------------------------

/** Reads of the title per picture, in parallel. */
export const TITLE_GATE_READS = 3;

/** The read itself: AUTO-209's transcription prompt, the one CHECK-image-brief-26 measured (98 of 105 reads exact, every picture correct). */
export const TITLE_READ_PROMPT = {
  system: 'You read text in images. Answer with ONE JSON object and nothing else.',
  user: 'This is a blog header picture with a title laid over it. Copy the title exactly, character for character, keeping capital letters and punctuation. Return {"title": "..."}',
} as const;

export const TITLE_READ_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: { title: { type: 'STRING' } },
  required: ['title'],
};

/**
 * A title folded for comparison: the two shapes of apostrophe and quote made
 * one, every dash a hyphen, spacing collapsed, case ignored. Every letter,
 * digit and punctuation mark still counts. Case is ignored because a poster
 * may set the title in capitals, and "CUSTOM PENS: A BUYER'S GUIDE" is the
 * right title.
 */
export function foldTitle(value: string): string {
  return value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True when a read is the post's title, character for character (folded as above). */
export function titleReadMatches(read: unknown, title: string): boolean {
  if (typeof read !== 'string') return false;
  const want = foldTitle(title);
  return want.length > 0 && foldTitle(read) === want;
}

export interface TitleGateResult {
  passed: boolean;
  /** Reads that came back at all. */
  answered: number;
  /** Reads that matched exactly. */
  exact: number;
  /** A read that did not match, for the note; null when all matched or none answered. */
  misread: string | null;
}

/**
 * THE GATE: accept on ONE exact read of TITLE_GATE_READS. Measured on 35
 * pictures whose title was correct by eye: a gate wanting all three reads to
 * agree would have refused 4 correct pictures (the reader dropped a stylised
 * digit, read one line of a wrapped title); one exact read of three passed all
 * 35. A read that did not come back (null) is not a match; with no read at
 * all the gate does not pass, and the caller says the title could not be
 * checked instead of saying it was wrong.
 */
export function titleGate(reads: readonly (string | null | undefined)[], title: string): TitleGateResult {
  const answered = reads.filter((r): r is string => typeof r === 'string');
  const exact = answered.filter((r) => titleReadMatches(r, title)).length;
  const misread = answered.find((r) => !titleReadMatches(r, title)) ?? null;
  return { passed: exact >= 1, answered: answered.length, exact, misread: misread ? misread.slice(0, 160) : null };
}

/** The title a read returned, or null (an unusable answer). */
export function parseTitleRead(raw: unknown): string | null {
  const t = (raw as { title?: unknown } | null)?.title;
  return typeof t === 'string' && t.trim() ? t.replace(/\s+/g, ' ').trim() : null;
}

// -- Alt text ---------------------------------------------------------------------

/** The alt text of a picture that carries the title: the title first, then what the picture shows. */
export function drawnHeaderAlt(title: string, topic: string): string {
  const t = cleanTitle(title);
  const what = topic.replace(/\s+/g, ' ').trim().toLowerCase() || 'promotional products';
  return `${t}${/[.!?]$/.test(t) ? '' : '.'} Blog header picture showing ${what}`;
}

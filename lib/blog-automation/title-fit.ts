/**
 * Making the model's title fit (AUTO-208, Part 6). PURE apart from the
 * injected shortening call: no DeepSeek, no Sanity, so vitest drives the
 * real decision with a fake shortener and the generator passes the real one.
 *
 * WHY. AUTO-203's `titleProblem` refuses a title over TITLE_MAX_CHARS (75),
 * and until this ticket that refusal threw the whole generation away: the
 * post was written, the words counted, the price check passed, and one
 * fault that is purely length lost it. AUTO-207's measuring cups proof died
 * exactly so (a 78-character title). Of the 38 distinct titles the archived
 * harnesses recorded, 1 ran past 75 (the koozies draft, 78) and 7 more sat
 * at 70 to 75; with AUTO-207's casualty that is 2 lost generations in about
 * 40, about 5%, which at two posts a night is a lost post most weeks.
 *
 * THE FIX: one small second call ("shorten this title; keep the number, the
 * product words and the shape"), then the SAME repairs and the SAME
 * `titleProblem` the original went through. So this never admits a title
 * the rule would have refused for any other reason; it buys a second chance
 * at the length fault alone. If the shortened title fails too, the
 * generation is refused exactly as before, with both faults named.
 */
import { repairListTitleNumber, repairQuestionTitle, titleProblem, TITLE_MAX_CHARS, type TitleShape } from './blog-shape';

export interface FitTitleInput {
  /** The model's title, as written. */
  title: string;
  shape: TitleShape;
  /** The topic the post is written for (its product words must survive). */
  topic: string;
  /** For a list: the number of idea sections actually written. */
  ideaCount?: number;
  /** Existing titles the shortener must not produce. */
  avoidTitles?: readonly string[];
  /** The shortening call; returns the shorter title (or '' when it could not). */
  shorten: (args: { title: string; shape: TitleShape; topic: string; ideaCount?: number; avoidTitles: readonly string[] }) => Promise<string>;
}

export type FitTitleResult =
  | { ok: true; title: string; repair: 'shortened' | null; shortenCalls: 0 | 1 }
  | { ok: false; title: string; fault: string; shortenCalls: 0 | 1 };

/** The deterministic repairs AUTO-203 applies before judging a title. */
export function repairTitle(title: string, shape: TitleShape, ideaCount?: number): string {
  let r = title.trim();
  if (shape === 'list' && ideaCount !== undefined) r = repairListTitleNumber(r, ideaCount);
  if (shape === 'question') r = repairQuestionTitle(r);
  return r;
}

/** True when the ONLY thing wrong with the title is its length. */
export function isLengthFault(title: string, fault: string | null): boolean {
  return fault !== null && title.length > TITLE_MAX_CHARS && /longer than Google shows/.test(fault);
}

/**
 * Repair, judge, and when the one fault is length, shorten once and judge
 * again.
 */
export async function fitTitle(input: FitTitleInput): Promise<FitTitleResult> {
  const avoid = input.avoidTitles ?? [];
  const judge = { ideaCount: input.ideaCount, topic: input.topic };
  const first = repairTitle(input.title, input.shape, input.ideaCount);
  const fault = titleProblem(first, input.shape, judge);
  if (!fault) return { ok: true, title: first, repair: null, shortenCalls: 0 };
  if (!isLengthFault(first, fault)) return { ok: false, title: first, fault, shortenCalls: 0 };

  let shortened = '';
  try {
    shortened = repairTitle(await input.shorten({ title: first, shape: input.shape, topic: input.topic, ideaCount: input.ideaCount, avoidTitles: avoid }), input.shape, input.ideaCount);
  } catch (err) {
    return { ok: false, title: first, fault: `${fault}; the title could not be shortened (${err instanceof Error ? err.message : String(err)})`, shortenCalls: 1 };
  }
  const secondFault = shortened ? titleProblem(shortened, input.shape, judge) : 'the shortening call returned no title';
  if (secondFault) {
    return { ok: false, title: first, fault: `${fault}; the shortened title did not fit either (${secondFault}: "${shortened}")`, shortenCalls: 1 };
  }
  return { ok: true, title: shortened, repair: 'shortened', shortenCalls: 1 };
}

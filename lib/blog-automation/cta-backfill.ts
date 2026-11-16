/**
 * AUTO-221: which existing posts get Patrick's AI-post CTA. Pure: no Sanity,
 * no fs, no next/*.
 *
 * AUTO-212 (2026-11-09) writes "Get Help with <Keyword>" and his sentence with
 * the keyword into every NEW draft the engine makes. The engine-made posts
 * written before that day still show the automatic "Order Custom ... Today"
 * heading and the default body, and Patrick was typing the new wording onto
 * them one post at a time. This is the rule for filling them in once.
 *
 * WHAT MAY BE WRITTEN: a post made from a search topic (`sourceTopic.query`)
 * whose CTA nobody has touched: no heading at all, and a body that is blank
 * or still the site default. ANYTHING PATRICK TYPED IS HIS: a heading of any
 * wording, or a body that is not the default, leaves the whole post alone.
 * The wording is `aiPostCta`'s, the one a new draft carries, never a second
 * spelling. A post and its draft copy are written together or not at all.
 */
import { DEFAULT_CTA_BODY } from '../blog/cta-defaults';
import { aiPostCta } from './draft-document';

/** The fields the rule reads, as a GROQ projection (the script's only read of a post). */
export const CTA_BACKFILL_FACTS = `{ _id, _rev, _createdAt, title, ctaTopic, ctaBody, "query": sourceTopic.query }`;

export interface CtaBackfillFacts {
  _id: string;
  _rev?: string;
  _createdAt?: string;
  title?: string;
  ctaTopic?: unknown;
  ctaBody?: unknown;
  /** `sourceTopic.query`: the search the post was generated from. */
  query?: unknown;
}

export type CtaBackfillLeftAlone = 'not-engine-made' | 'already' | 'heading-typed' | 'body-edited' | 'pair-differs' | 'unreadable';

export type CtaBackfillVerdict =
  | { write: true; id: string; ifRevisionId: string; set: { ctaTopic: string; ctaBody: string } }
  | { write: false; reason: CtaBackfillLeftAlone; why: string };

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** One document, judged on its own. */
export function planCtaBackfill(facts: CtaBackfillFacts | null | undefined): CtaBackfillVerdict {
  if (!facts || typeof facts._id !== 'string' || !facts._id || typeof facts._rev !== 'string' || !facts._rev) {
    return { write: false, reason: 'unreadable', why: 'the post could not be read with its revision, so it is not written' };
  }
  const cta = aiPostCta(facts.query);
  if (!cta) return { write: false, reason: 'not-engine-made', why: 'it was not made from a search topic' };
  const heading = text(facts.ctaTopic);
  const body = text(facts.ctaBody);
  if (heading) {
    if (heading === cta.heading && body === text(cta.body)) return { write: false, reason: 'already', why: 'it already carries the new wording' };
    return { write: false, reason: 'heading-typed', why: `it has a CTA heading of its own ("${heading}")` };
  }
  if (body && body !== text(DEFAULT_CTA_BODY)) {
    return { write: false, reason: 'body-edited', why: 'its CTA body text was edited by hand' };
  }
  return { write: true, id: facts._id, ifRevisionId: facts._rev, set: { ctaTopic: cta.heading, ctaBody: cta.body } };
}

const publishedIdOf = (id: string): string => id.replace(/^drafts\./, '');

/**
 * `--skip`: posts held back by name, for a heading that would read badly
 * because the search it comes from does ("custom balloons cheap"). The ids as
 * typed, in any mix of commas and spaces, with or without a `drafts.` prefix,
 * each once.
 */
export function skipIdsFrom(values: readonly string[]): string[] {
  const ids = values
    .flatMap((v) => v.split(/[\s,]+/))
    .map((v) => publishedIdOf(v.trim()))
    .filter(Boolean);
  return [...new Set(ids)];
}

/** A held-back post is held back in both of its copies, the published one and its draft. */
export function isHeldBack(id: string, skip: ReadonlySet<string>): boolean {
  return skip.has(publishedIdOf(id));
}

/**
 * The `--skip` ids that name no engine-made post at all. A mistyped id would
 * otherwise let the very post it was meant to hold back be written, so the
 * script stops on any of these before it writes anything.
 */
export function unknownSkipIds(skip: readonly string[], plans: readonly { facts: CtaBackfillFacts }[]): string[] {
  const known = new Set(plans.map((p) => publishedIdOf(p.facts._id)));
  return skip.filter((id) => !known.has(id));
}

/**
 * Every document, with the pair rule: a published post and its draft copy are
 * both written or neither is. If only one of the two were written, publishing
 * the draft would either put the old wording back or replace the wording he
 * typed on the other copy.
 *
 * The two copies are written one after the other, each after a fresh read, so
 * the second copy is judged when the first ALREADY carries the new wording.
 * That is agreement, not wording of its own: the other copy stands in the way
 * only when it holds something else (the first commit run, 2026-11-16, left a
 * draft copy unwritten because this was not told apart).
 */
export function planCtaBackfillAll(rows: readonly (CtaBackfillFacts | null | undefined)[]): { facts: CtaBackfillFacts; verdict: CtaBackfillVerdict }[] {
  const judged = rows.filter((r): r is CtaBackfillFacts => Boolean(r && typeof r._id === 'string')).map((facts) => ({ facts, verdict: planCtaBackfill(facts) }));
  const pairs = new Map<string, typeof judged>();
  for (const j of judged) {
    const key = publishedIdOf(j.facts._id);
    pairs.set(key, [...(pairs.get(key) ?? []), j]);
  }
  /** The other copy would be written too, or already holds exactly the wording this copy is about to get. */
  const agrees = (other: (typeof judged)[number], set: { ctaTopic: string; ctaBody: string }): boolean =>
    other.verdict.write === true ||
    (other.verdict.reason === 'already' && text(other.facts.ctaTopic) === text(set.ctaTopic) && text(other.facts.ctaBody) === text(set.ctaBody));
  return judged.map((j) => {
    const pair = pairs.get(publishedIdOf(j.facts._id)) ?? [j];
    const verdict = j.verdict;
    if (verdict.write === true && pair.some((other) => !agrees(other, verdict.set))) {
      return { facts: j.facts, verdict: { write: false, reason: 'pair-differs', why: 'its other copy (the draft or the published post) carries wording of its own, so neither copy is changed' } };
    }
    return j;
  });
}

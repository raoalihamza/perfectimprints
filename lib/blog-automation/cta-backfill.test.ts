/**
 * AUTO-221: Patrick's AI-post CTA on the engine-made posts written BEFORE
 * AUTO-212 shipped (2026-11-09).
 *
 * What may be written is decided by the pure rule here and by nothing in the
 * script: a post the engine made, whose CTA nobody has touched (no heading,
 * and a body that is blank or still the site default). Anything Patrick typed
 * is his and is left exactly as it is.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CTA_BODY } from '../blog/cta-defaults';
import { isHeldBack, planCtaBackfill, planCtaBackfillAll, skipIdsFrom, unknownSkipIds, type CtaBackfillFacts } from './cta-backfill';
import { aiPostCta } from './draft-document';

const row = (over: Partial<CtaBackfillFacts> = {}): CtaBackfillFacts => ({
  _id: 'drafts.abc',
  _rev: 'rev1',
  title: 'Promotional Scarves: A Buyer\'s Guide for Bulk Orders',
  query: 'promotional scarves',
  ctaBody: DEFAULT_CTA_BODY,
  ...over,
});

describe('which posts get the CTA (AUTO-221)', () => {
  it('an engine-made post with no heading and the default body gets both fields, pinned to the revision read', () => {
    const plan = planCtaBackfill(row());
    expect(plan).toEqual({
      write: true,
      id: 'drafts.abc',
      ifRevisionId: 'rev1',
      set: {
        ctaTopic: 'Get Help with Promotional Scarves',
        ctaBody: aiPostCta('promotional scarves')?.body,
      },
    });
  });

  it('a blank body counts as untouched too (the page shows the default for it)', () => {
    for (const ctaBody of [undefined, null, '', '   ']) expect(planCtaBackfill(row({ ctaBody })).write).toBe(true);
  });

  it('the wording is exactly what a new generated draft carries', () => {
    const plan = planCtaBackfill(row({ query: 'ink pens with logo' }));
    expect(plan.write === true && plan.set).toEqual({ ctaTopic: aiPostCta('ink pens with logo')?.heading, ctaBody: aiPostCta('ink pens with logo')?.body });
  });

  it('a heading Patrick typed is never replaced, whatever the body says', () => {
    for (const ctaTopic of ['Get Help With Promotional Matches!', 'Order Custom Pens Today For Your Company', 'Need Help With Custom Diner Mugs?']) {
      const plan = planCtaBackfill(row({ ctaTopic }));
      expect(plan).toMatchObject({ write: false, reason: 'heading-typed' });
    }
  });

  it('a body he edited is never replaced, even with no heading', () => {
    const plan = planCtaBackfill(row({ ctaBody: 'Call us today and ask for Patrick.' }));
    expect(plan).toMatchObject({ write: false, reason: 'body-edited' });
  });

  it('a post that already carries the new wording is left alone, so a second run writes nothing', () => {
    const cta = aiPostCta('promotional scarves');
    const plan = planCtaBackfill(row({ ctaTopic: cta?.heading, ctaBody: cta?.body }));
    expect(plan).toMatchObject({ write: false, reason: 'already' });
  });

  it('a post that was not made from a search topic is never touched', () => {
    for (const query of [undefined, null, '', '  ', 42]) {
      expect(planCtaBackfill(row({ query }))).toMatchObject({ write: false, reason: 'not-engine-made' });
    }
  });

  it('a row that cannot be pinned to a revision is not written', () => {
    expect(planCtaBackfill(row({ _rev: undefined }))).toMatchObject({ write: false, reason: 'unreadable' });
    expect(planCtaBackfill(null)).toMatchObject({ write: false, reason: 'unreadable' });
  });
});

describe('a post and its draft copy move together or not at all (AUTO-221)', () => {
  it('both untouched: both are written', () => {
    const plans = planCtaBackfillAll([row({ _id: 'p1', _rev: 'a' }), row({ _id: 'drafts.p1', _rev: 'b' })]);
    expect(plans.map((p) => p.verdict.write)).toEqual([true, true]);
  });

  it('one of the two carries his wording: neither is written, so publishing his draft cannot be undone by us or undo us', () => {
    const plans = planCtaBackfillAll([row({ _id: 'p1', _rev: 'a' }), row({ _id: 'drafts.p1', _rev: 'b', ctaTopic: 'Get Help With Koozies' })]);
    expect(plans[0].verdict).toMatchObject({ write: false, reason: 'pair-differs' });
    expect(plans[1].verdict).toMatchObject({ write: false, reason: 'heading-typed' });
  });

  it('the first copy was just written: the second, still untouched, is written too (what a commit run meets on the second half of a pair)', () => {
    const cta = aiPostCta('promotional scarves');
    const plans = planCtaBackfillAll([row({ _id: 'p1', _rev: 'a2', ctaTopic: cta?.heading, ctaBody: cta?.body }), row({ _id: 'drafts.p1', _rev: 'b' })]);
    expect(plans[0].verdict).toMatchObject({ write: false, reason: 'already' });
    expect(plans[1].verdict).toMatchObject({ write: true, id: 'drafts.p1', ifRevisionId: 'b', set: { ctaTopic: cta?.heading, ctaBody: cta?.body } });
    // The same the other way round: the draft copy written first, the published copy second.
    const reversed = planCtaBackfillAll([row({ _id: 'p1', _rev: 'a' }), row({ _id: 'drafts.p1', _rev: 'b2', ctaTopic: cta?.heading, ctaBody: cta?.body })]);
    expect(reversed[0].verdict).toMatchObject({ write: true, id: 'p1' });
  });

  it('the other copy carries the new wording of a DIFFERENT search: that is not this copy\'s wording, so neither is changed', () => {
    const other = aiPostCta('custom koozies');
    const plans = planCtaBackfillAll([row({ _id: 'p1', _rev: 'a', query: 'custom koozies', ctaTopic: other?.heading, ctaBody: other?.body }), row({ _id: 'drafts.p1', _rev: 'b' })]);
    expect(plans[0].verdict).toMatchObject({ write: false, reason: 'already' });
    expect(plans[1].verdict).toMatchObject({ write: false, reason: 'pair-differs' });
  });

  it('a draft with no published copy is judged on its own', () => {
    const plans = planCtaBackfillAll([row({ _id: 'drafts.solo' }), row({ _id: 'other', ctaTopic: 'Mine' })]);
    expect(plans[0].verdict.write).toBe(true);
    expect(plans[1].verdict).toMatchObject({ write: false, reason: 'heading-typed' });
  });
});

describe('holding named posts back (AUTO-221, --skip)', () => {
  it('reads the ids however they were typed: commas, spaces, a drafts. prefix', () => {
    expect(skipIdsFrom(['a, drafts.b', ',c', 'a'])).toEqual(['a', 'b', 'c']);
    expect(skipIdsFrom([])).toEqual([]);
  });

  it('a held-back post is held back in both of its copies', () => {
    const skip = new Set(['p1']);
    expect(isHeldBack('p1', skip)).toBe(true);
    expect(isHeldBack('drafts.p1', skip)).toBe(true);
    expect(isHeldBack('p2', skip)).toBe(false);
  });

  it('an id that names no engine-made post is reported, so a mistyped id cannot let its post through', () => {
    const plans = planCtaBackfillAll([row({ _id: 'p1' }), row({ _id: 'drafts.p2' })]);
    expect(unknownSkipIds(['p1', 'p2', 'p9'], plans)).toEqual(['p9']);
    expect(unknownSkipIds([], plans)).toEqual([]);
  });
});

describe('the script that runs it (AUTO-221)', () => {
  const script = readFileSync('scripts/migrations/backfill-ai-post-cta.ts', 'utf8');

  it('is a dry run unless --commit is passed, and --dry-run wins', () => {
    expect(script).toContain("args.includes('--commit') && !args.includes('--dry-run')");
  });

  it('has ONE write, a patch of the two fields the rule returned, pinned to the revision', () => {
    expect(script.match(/\.commit\(/g)?.length).toBe(1);
    expect(script.match(/client\.patch\(/g)?.length).toBe(1);
    expect(script).toContain('.ifRevisionId(fresh.ifRevisionId).set(fresh.set).commit(');
    expect(script).not.toMatch(/\.delete\(|createOrReplace|createIfNotExists|\.create\(|\.unset\(|transaction\(/);
  });

  it('stops before any write when a --skip id names no post, and never writes a held-back post', () => {
    const stop = script.indexOf('unknownSkipIds(skip, plans)');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(script.indexOf('client.patch('));
    expect(script).toContain('!isHeldBack(id, skipSet)');
  });

  it('judges every post again, on a fresh read, immediately before it writes', () => {
    expect(script).toContain('planCtaBackfillAll(await readPair(');
  });

  it('takes its rule from the pure module and spells no CTA wording of its own', () => {
    expect(script).toContain("from '../../lib/blog-automation/cta-backfill'");
    expect(script).not.toMatch(/Get Help with|pick the right|AI_POST_CTA|aiPostCta/);
  });
});

/**
 * AUTO-220 Part 10: which existing drafts the soak may regenerate a header
 * picture on, and the guard that stands in front of every write.
 *
 * Ali's three hard limits (2026-11-15), each proven here BEFORE anything runs:
 *   1. Drafts only. Nothing published is touched.
 *   2. Only drafts the automation created, and only where the current header
 *      is one the site made. A draft Patrick wrote, or a picture he uploaded
 *      or replaced himself, is left completely alone.
 *   3. This file is that proof.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { soakDraftVerdict, soakWritePlan, SOAK_DRAFT_FACTS, type SoakDraftFacts, type SoakOutcome } from './soak-drafts';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const OLD = 'image-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1376x768-png';
const OLD_COPY = 'image-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-1376x768-jpg';
const NEW = 'image-cccccccccccccccccccccccccccccccccccccccc-1536x864-png';
const NEW_COPY = 'image-dddddddddddddddddddddddddddddddddddddddd-1536x864-jpg';
const HIS = 'image-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-1661x947-jpg';

/** A draft the scheduler made, carrying an AUTO-209 composite (the marker, a PNG) and its untitled copy. */
function draft(over: Partial<SoakDraftFacts> = {}): SoakDraftFacts {
  return {
    _id: 'drafts.11111111-2222-3333-4444-555555555555',
    _rev: 'rev-1',
    publishedCopyExists: false,
    sourceTopic: { query: 'custom candles' },
    headerImage: { asset: { _ref: OLD }, untitledImage: { asset: { _ref: OLD_COPY } } },
    headerAsset: { _id: OLD, originalFilename: 'custom-candles-header.png', mimeType: 'image/png', width: 1376, height: 768, source: { name: BLOG_HEADER_ASSET_SOURCE, id: 'custom-candles-header.png' } },
    ...over,
  };
}
const refusal = (d: SoakDraftFacts | null | undefined) => {
  const v = soakDraftVerdict(d);
  return v.eligible === false ? v.reason : 'ELIGIBLE';
};

describe('which drafts the soak may touch', () => {
  it('a never-published draft the engine made, whose header the site generated: eligible', () => {
    expect(soakDraftVerdict(draft())).toEqual({ eligible: true });
    // A picture from before the upload marker existed (AUTO-202 to AUTO-206): the exact fingerprint of one.
    const older = draft({ headerImage: { asset: { _ref: OLD_COPY } }, headerAsset: { _id: OLD_COPY, originalFilename: 'custom-tools-header-2.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null } });
    expect(soakDraftVerdict(older)).toEqual({ eligible: true });
  });

  it('LIMIT 1, drafts only: a published document is never eligible, whatever else is true of it', () => {
    expect(refusal(draft({ _id: '11111111-2222-3333-4444-555555555555' }))).toBe('not-a-draft');
    expect(refusal(draft({ _id: 'drafts.' }))).toBe('not-a-draft');
    expect(refusal(draft({ _id: '' }))).toBe('not-a-draft');
    expect(refusal(null)).toBe('not-a-draft');
    expect(refusal(undefined)).toBe('not-a-draft');
  });

  it('LIMIT 1: a draft that sits over a PUBLISHED post is the next version of something live, and is left alone', () => {
    expect(refusal(draft({ publishedCopyExists: true }))).toBe('published');
    // Not knowing is not "no": the fact must be an explicit false.
    expect(refusal(draft({ publishedCopyExists: undefined as unknown as boolean }))).toBe('published');
    expect(refusal(draft({ publishedCopyExists: null as unknown as boolean }))).toBe('published');
  });

  it('LIMIT 2: a draft Patrick wrote is left alone, even when a generated picture is on it', () => {
    // No record of a search topic: the engine did not create this document (he pressed Generate header image on his own post).
    expect(refusal(draft({ sourceTopic: null }))).toBe('not-engine-made');
    expect(refusal(draft({ sourceTopic: undefined }))).toBe('not-engine-made');
    expect(refusal(draft({ sourceTopic: { query: '   ' } }))).toBe('not-engine-made');
    expect(refusal(draft({ sourceTopic: { query: 42 } }))).toBe('not-engine-made');
  });

  it('LIMIT 2: a picture Patrick uploaded is left alone', () => {
    const his = { _id: HIS, originalFilename: 'Custom Candles Blog Header.jpg', mimeType: 'image/jpeg', width: 1661, height: 947, source: null };
    expect(refusal(draft({ headerImage: { asset: { _ref: HIS } }, headerAsset: his }))).toBe('header-not-ours');
  });

  it('LIMIT 2: a picture he uploaded OVER a generated one is left alone, although Studio keeps our old fields beside his asset', () => {
    // AUTO-212 found this state on published posts: titleOnImage and untitledImage stay; the asset is his.
    const his = { _id: HIS, originalFilename: 'candles-final.jpg', mimeType: 'image/jpeg', width: 1661, height: 947, source: null };
    const d = draft({ headerImage: { asset: { _ref: HIS }, untitledImage: { asset: { _ref: OLD_COPY } } }, headerAsset: his });
    expect(refusal(d)).toBe('header-not-ours');
  });

  it('LIMIT 2: an asset uploaded through another tool, a 1376 x 768 JPEG with his own filename, and a library picture are not ours', () => {
    expect(refusal(draft({ headerAsset: { _id: OLD, originalFilename: 'x-header.png', mimeType: 'image/png', width: 1376, height: 768, source: { name: 'unsplash', id: 'abc' } } }))).toBe('header-not-ours');
    expect(refusal(draft({ headerAsset: { _id: OLD, originalFilename: 'IMG_2041.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null } }))).toBe('header-not-ours');
    expect(refusal(draft({ headerAsset: { _id: OLD, originalFilename: 'candles-header.png', mimeType: 'image/png', width: 1376, height: 768, source: null } }))).toBe('header-not-ours');
  });

  it('no header on the draft, or a product photo shown from the catalogue: nothing of ours to regenerate', () => {
    expect(refusal(draft({ headerImage: null, headerAsset: null }))).toBe('no-generated-header');
    expect(refusal(draft({ headerImage: { asset: null }, headerAsset: null }))).toBe('no-generated-header');
    expect(refusal(draft({ headerImage: { asset: { _ref: 'not-an-asset-id' } }, headerAsset: null }))).toBe('no-generated-header');
  });

  it('fails CLOSED when the asset document cannot be read, or is not the one the draft points at', () => {
    expect(refusal(draft({ headerAsset: null }))).toBe('asset-unreadable');
    expect(refusal(draft({ headerAsset: { ...draft().headerAsset!, _id: NEW } }))).toBe('asset-unreadable');
  });

  it('a draft the new engine has already drawn for is not drawn for again (so a second run spends nothing)', () => {
    const done = draft({
      headerImage: { asset: { _ref: NEW }, unmarkedImage: { asset: { _ref: NEW_COPY } } },
      headerAsset: { _id: NEW, originalFilename: 'custom-candles-header.png', mimeType: 'image/png', width: 1536, height: 864, source: { name: BLOG_HEADER_ASSET_SOURCE, id: 'x' } },
    });
    expect(refusal(done)).toBe('already-new-engine');
  });

  it('every refusal says why in a sentence', () => {
    for (const d of [draft({ _id: 'x' }), draft({ publishedCopyExists: true }), draft({ sourceTopic: null }), draft({ headerImage: null, headerAsset: null }), draft({ headerAsset: null })]) {
      const v = soakDraftVerdict(d);
      expect(v.eligible).toBe(false);
      if (v.eligible === false) expect(v.why.length).toBeGreaterThan(20);
    }
  });
});

describe('the guard in front of every write', () => {
  const made: SoakOutcome = {
    kind: 'asset',
    source: 'ai',
    image: { _type: 'image', asset: { _type: 'reference', _ref: NEW }, alt: 'alt', titleOnImage: 'T', ladderRung: 1, unmarkedImage: { _type: 'image', asset: { _type: 'reference', _ref: NEW_COPY } } },
  };

  it('writes ONE field on the DRAFT, pinned to the revision just read, and names what the old picture leaves behind', () => {
    const plan = soakWritePlan({ before: draft(), now: draft({ _rev: 'rev-1' }), outcome: made });
    expect(plan).toEqual({
      write: true,
      draftId: 'drafts.11111111-2222-3333-4444-555555555555',
      ifRevisionId: 'rev-1',
      set: { headerImage: made.image },
      unset: ['externalHeaderImage'],
      replacedRefs: [OLD, OLD_COPY],
    });
  });

  it('Patrick uploaded his own picture while the new one was being drawn: NOTHING is written and the new picture is discarded', () => {
    const his = { _id: HIS, originalFilename: 'mine.jpg', mimeType: 'image/jpeg', width: 1661, height: 947, source: null };
    const now = draft({ _rev: 'rev-2', headerImage: { asset: { _ref: HIS } }, headerAsset: his });
    const plan = soakWritePlan({ before: draft(), now, outcome: made });
    expect(plan.write).toBe(false);
    if (plan.write === false) {
      expect(plan.reason).toContain('uploaded');
      expect(plan.discardRefs).toEqual([NEW, NEW_COPY]);
    }
  });

  it('the draft was published, deleted or changed hands during the wait: nothing is written', () => {
    for (const now of [null, draft({ publishedCopyExists: true }), draft({ sourceTopic: null }), draft({ _id: 'drafts.another' }), draft({ _rev: undefined })]) {
      const plan = soakWritePlan({ before: draft(), now, outcome: made });
      expect(plan.write, JSON.stringify(now)?.slice(0, 80)).toBe(false);
      if (plan.write === false) expect(plan.discardRefs).toEqual([NEW, NEW_COPY]);
    }
  });

  it('another generated picture took its place during the wait (he pressed the button himself): his press wins', () => {
    const other = 'image-ffffffffffffffffffffffffffffffffffffffff-1376x768-png';
    const now = draft({ _rev: 'rev-3', headerImage: { asset: { _ref: other } }, headerAsset: { ...draft().headerAsset!, _id: other } });
    const plan = soakWritePlan({ before: draft(), now, outcome: made });
    expect(plan.write).toBe(false);
  });

  it('a stand-in never replaces a picture: a library picture, a product photo and "nothing" are not written', () => {
    const standIns: SoakOutcome[] = [
      { kind: 'asset', source: 'library', image: { _type: 'image', asset: { _type: 'reference', _ref: HIS } } },
      { kind: 'url', source: 'product', url: 'https://imgsirv.geiger.com/x.jpg', alt: 'a' },
      { kind: 'none' },
    ];
    for (const outcome of standIns) {
      const plan = soakWritePlan({ before: draft(), now: draft(), outcome });
      expect(plan.write).toBe(false);
      // Nothing of ours was uploaded for a stand-in, so there is nothing to discard.
      if (plan.write === false) expect(plan.discardRefs).toEqual([]);
    }
  });

  it('can never name a published document: the id it writes to always starts with drafts.', () => {
    const plan = soakWritePlan({ before: draft(), now: draft(), outcome: made });
    expect(plan.write === true && plan.draftId.startsWith('drafts.')).toBe(true);
    const published = draft({ _id: '11111111-2222-3333-4444-555555555555' });
    expect(soakWritePlan({ before: published, now: published, outcome: made }).write).toBe(false);
  });

  it('a picture with no mark stamped is its own copy: it is named once', () => {
    const noMark: SoakOutcome = { ...made, image: { ...made.image!, unmarkedImage: { _type: 'image', asset: { _type: 'reference', _ref: NEW } } } };
    const refused = soakWritePlan({ before: draft(), now: null, outcome: noMark });
    expect(refused.write === false && refused.discardRefs).toEqual([NEW]);
  });
});

describe('structure: the script cannot write around the guard', () => {
  const script = read('scripts/blog-automation/soak-draft-headers.ts');

  it('no flag means a dry run, and --dry-run wins over --commit', () => {
    expect(script).toContain("const commit = args.includes('--commit') && !args.includes('--dry-run');");
  });

  it('the ONLY write to a post is one patch, built from the plan, pinned to the revision', () => {
    // One patch call in the whole script, and it takes its id, its revision and its fields from the plan.
    expect(script.match(/\.patch\(/g)).toHaveLength(1);
    expect(script).toContain('client.patch(plan.draftId).ifRevisionId(plan.ifRevisionId).set(plan.set).unset(plan.unset).commit()');
    // Nothing else can create, replace or delete a document; pictures go only through the guarded discard rule.
    for (const banned of ['.create(', '.createIfNotExists(', '.transaction(', '.delete(', 'mutate(']) {
      expect(script, banned).not.toContain(banned);
    }
    expect(script.match(/createOrReplace\(/g)).toHaveLength(1); // the session nonce, the document the Studio itself writes
    expect(script).toContain('_id: GENERATE_AUTH_DOC_ID');
    expect(script).toContain('discardGeneratedHeaderImage(');
  });

  it('eligibility is judged by the rule, on a fresh read, before the picture is asked for AND again before the write', () => {
    const askAt = script.indexOf('/api/sanity/generate-blog-image');
    const firstVerdict = script.indexOf('soakDraftVerdict(');
    const planAt = script.indexOf('soakWritePlan(');
    const patchAt = script.indexOf('client.patch(plan.draftId)');
    expect(firstVerdict).toBeGreaterThan(-1);
    expect(firstVerdict).toBeLessThan(askAt === -1 ? Infinity : script.indexOf('await askForPicture('));
    expect(planAt).toBeGreaterThan(script.indexOf('await askForPicture('));
    expect(planAt).toBeLessThan(patchAt);
    // The facts are read with the ONE projection the rule was tested against.
    expect(script).toContain('SOAK_DRAFT_FACTS');
    expect(SOAK_DRAFT_FACTS).toContain('"publishedCopyExists": count(*[_id == string::split(^._id, "drafts.")[1]]) > 0');
    expect(SOAK_DRAFT_FACTS).toContain('"headerAsset": headerImage.asset->');
  });

  it('the picture is asked from the deployed engine (the route the Studio button calls), on a host the site owns, and no key is read or printed', () => {
    expect(script).toContain('/api/sanity/generate-blog-image');
    expect(script).toContain("from '../../lib/seo/indexing-policy'");
    expect(script).not.toMatch(/OPENAI_API_KEY|GOOGLE_GEMINI_API_KEY/);
    expect(script).not.toMatch(/console\.(log|error|info)\([^)]*token/i);
  });
});

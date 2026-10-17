/**
 * AUTO-207: a generated header picture is removed when it is replaced or not
 * used, and NOTHING else is: an uploaded picture is never touched, a picture
 * any document still references (a draft included) is never touched, and a
 * delete Sanity refuses is kept, never forced. Driven against a fake dataset
 * that counts references the way the raw perspective does (drafts and
 * published alike) and refuses to delete a referenced asset, as Sanity does.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOG_HEADER_ASSET_SOURCE,
  discardGeneratedHeaderImage,
  discardReplacedHeaderImage,
  headerAssetId,
  isGeneratedHeaderAsset,
  type HeaderAssetFacts,
} from './discard-header-image';

const GENERATED = 'image-a1b2c3d4e5f6-1376x768-jpg';
const LEGACY = 'image-0f9e8d7c6b5a-1376x768-jpg';
const UPLOADED = 'image-9a8b7c6d5e4f-4032x3024-jpg';
const UPLOADED_SAME_SIZE = 'image-1122334455aa-1376x768-jpg';

interface Doc {
  _id: string;
  ref: string;
}

/** A tiny dataset: assets, and documents (drafts and published) pointing at them. */
function fakeDataset(docs: Doc[] = []) {
  const assets = new Map<string, HeaderAssetFacts>([
    [GENERATED, { _id: GENERATED, originalFilename: 'custom-tools-header.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: { name: BLOG_HEADER_ASSET_SOURCE, id: 'custom-tools-header.jpg' } }],
    [LEGACY, { _id: LEGACY, originalFilename: '8-custom-koozies-ideas-header-2.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null }],
    [UPLOADED, { _id: UPLOADED, originalFilename: 'IMG_2041.jpg', mimeType: 'image/jpeg', width: 4032, height: 3024, source: null }],
    // An upload that happens to be the same size: its name gives it away.
    [UPLOADED_SAME_SIZE, { _id: UPLOADED_SAME_SIZE, originalFilename: 'patrick-totes-banner.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null }],
  ]);
  const deleted: string[] = [];
  const queries: Record<string, unknown>[] = [];
  const client = {
    docs,
    fetch: async <T,>(_query: string, params: Record<string, unknown>): Promise<T> => {
      queries.push(params);
      const id = String(params.id);
      return { asset: assets.get(id) ?? null, references: client.docs.filter((d) => d.ref === id).length } as T;
    },
    delete: async (id: string) => {
      // Sanity refuses to delete a document a strong reference points at.
      if (client.docs.some((d) => d.ref === id)) throw new Error(`Document "${id}" cannot be deleted as there are references to it`);
      assets.delete(id);
      deleted.push(id);
      return {};
    },
  };
  return { client, deleted, queries, assets };
}

describe('which pictures are ours', () => {
  it('a picture carrying the upload marker is generated; so is one with the exact legacy fingerprint; an upload is not', () => {
    const { assets } = fakeDataset();
    expect(isGeneratedHeaderAsset(assets.get(GENERATED))).toBe(true);
    expect(isGeneratedHeaderAsset(assets.get(LEGACY))).toBe(true);
    expect(isGeneratedHeaderAsset(assets.get(UPLOADED))).toBe(false);
    expect(isGeneratedHeaderAsset(assets.get(UPLOADED_SAME_SIZE))).toBe(false);
  });

  it('the legacy fingerprint needs every part: the filename shape, JPEG, 1376 x 768, and no source of its own', () => {
    const legacy: HeaderAssetFacts = { _id: LEGACY, originalFilename: 'x-header.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null };
    expect(isGeneratedHeaderAsset(legacy)).toBe(true);
    expect(isGeneratedHeaderAsset({ ...legacy, width: 1400 })).toBe(false);
    expect(isGeneratedHeaderAsset({ ...legacy, mimeType: 'image/png' })).toBe(false);
    expect(isGeneratedHeaderAsset({ ...legacy, originalFilename: 'x-header-final.jpg' })).toBe(false);
    expect(isGeneratedHeaderAsset({ ...legacy, source: { name: 'unsplash', id: 'abc' } })).toBe(false);
    expect(isGeneratedHeaderAsset({ ...legacy, _id: 'file-abc-pdf' })).toBe(false);
    expect(isGeneratedHeaderAsset(null)).toBe(false);
  });

  it('only an image asset id is accepted', () => {
    expect(headerAssetId(GENERATED)).toBe(GENERATED);
    expect(headerAssetId('drafts.abc')).toBeNull();
    expect(headerAssetId('')).toBeNull();
    expect(headerAssetId(undefined)).toBeNull();
  });
});

describe('removing a generated picture', () => {
  it('an unreferenced generated picture is deleted, legacy or marked', async () => {
    const d = fakeDataset();
    expect(await discardGeneratedHeaderImage(d.client, GENERATED)).toEqual({ deleted: true, assetId: GENERATED });
    expect(await discardGeneratedHeaderImage(d.client, LEGACY)).toEqual({ deleted: true, assetId: LEGACY });
    expect(d.deleted).toEqual([GENERATED, LEGACY]);
  });

  it('a picture Patrick uploaded is NEVER deleted, referenced or not', async () => {
    const d = fakeDataset();
    expect(await discardGeneratedHeaderImage(d.client, UPLOADED)).toMatchObject({ deleted: false, reason: 'not-generated' });
    expect(await discardGeneratedHeaderImage(d.client, UPLOADED_SAME_SIZE)).toMatchObject({ deleted: false, reason: 'not-generated' });
    expect(d.deleted).toEqual([]);
  });

  it("a generated picture still referenced survives: a DRAFT's reference protects it as surely as a published one", async () => {
    for (const holder of ['drafts.post-1', 'post-1', 'some-other-post']) {
      const d = fakeDataset([{ _id: holder, ref: GENERATED }]);
      expect(await discardGeneratedHeaderImage(d.client, GENERATED)).toMatchObject({ deleted: false, reason: 'referenced' });
      expect(d.deleted).toEqual([]);
    }
  });

  it('a delete Sanity refuses (a reference appeared after the count) is kept and reported, never forced, and nothing throws', async () => {
    const d = fakeDataset();
    const racing = { ...d.client, fetch: async <T,>(q: string, p: Record<string, unknown>): Promise<T> => { const r = await d.client.fetch<T>(q, p); d.client.docs.push({ _id: 'drafts.late', ref: GENERATED }); return r; } };
    const out = await discardGeneratedHeaderImage(racing, GENERATED);
    expect(out).toMatchObject({ deleted: false, reason: 'error' });
    expect(d.deleted).toEqual([]);
  });

  it('a missing asset, a bad id and a failing read are values, never exceptions', async () => {
    const d = fakeDataset();
    expect(await discardGeneratedHeaderImage(d.client, 'image-ffffffffffff-1376x768-jpg')).toMatchObject({ deleted: false, reason: 'missing' });
    expect(await discardGeneratedHeaderImage(d.client, 42)).toMatchObject({ deleted: false, reason: 'not-an-asset' });
    const broken = { fetch: async () => { throw new Error('network'); }, delete: async () => ({}) };
    expect(await discardGeneratedHeaderImage(broken, GENERATED)).toMatchObject({ deleted: false, reason: 'error', detail: 'network' });
  });
});

describe('after a replace (the Studio buttons)', () => {
  it('waits until the draft no longer points at the old picture, then removes it', async () => {
    const d = fakeDataset([{ _id: 'drafts.post-1', ref: GENERATED }]);
    let looks = 0;
    const out = await discardReplacedHeaderImage(d.client, GENERATED, {
      waitMs: 1,
      sleep: async () => {
        looks += 1;
        // The patch commits after the second look.
        if (looks === 2) d.client.docs = [];
      },
    });
    expect(out).toEqual({ deleted: true, assetId: GENERATED });
    expect(d.queries).toHaveLength(3);
  });

  it('gives up and KEEPS the picture while the published post still shows it', async () => {
    const d = fakeDataset([{ _id: 'post-1', ref: GENERATED }]);
    const out = await discardReplacedHeaderImage(d.client, GENERATED, { attempts: 3, waitMs: 1, sleep: async () => {} });
    expect(out).toMatchObject({ deleted: false, reason: 'referenced' });
    expect(d.queries).toHaveLength(3);
    expect(d.deleted).toEqual([]);
  });

  it('stops at once for a picture that is not ours', async () => {
    const d = fakeDataset();
    const out = await discardReplacedHeaderImage(d.client, UPLOADED, { waitMs: 1, sleep: async () => {} });
    expect(out).toMatchObject({ deleted: false, reason: 'not-generated' });
    expect(d.queries).toHaveLength(1);
  });
});

describe('structure', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
  it('the rule module imports nothing (the Studio bundle and the server both take it)', () => {
    expect(read('lib/blog-automation/discard-header-image.ts').match(/^import .*$/gm)).toBeNull();
  });

  it('references are counted over every document, drafts included: the query has no draft filter, and the clients read raw', () => {
    const src = read('lib/blog-automation/discard-header-image.ts');
    expect(src).toContain('"references": count(*[references($id)])');
    expect(src).not.toMatch(/drafts\.\*\*|!\(_id in path/);
    expect(read('sanity/components/useHeaderAssetDiscard.ts')).toContain("withConfig({ perspective: 'raw', useCdn: false })");
  });

  it('only the three places that take a picture off a post, or leave one unused, delete through the rule; no bulk cleanup exists', () => {
    const callers = ['lib/blog-automation/create-blog-draft.ts', 'sanity/components/useHeaderAssetDiscard.ts'];
    for (const f of callers) expect(read(f)).toMatch(/discard(Generated|Replaced)HeaderImage/);
    for (const f of ['sanity/actions/generate-blog-image-with-ai.tsx', 'sanity/actions/generate-blog-with-ai.tsx']) {
      expect(read(f)).toContain('useHeaderAssetDiscard');
      expect(read(f)).not.toMatch(/\.delete\(/);
    }
  });
});

/**
 * AUTO-208 Part 8: the weekly orphan sweep. Dry run deletes nothing;
 * a commit re-counts references immediately before each delete and never
 * deletes an asset any document references; only generated header pictures
 * are ever in scope.
 */
import { describe, expect, it, vi } from 'vitest';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';
import { ORPHAN_MIN_AGE_HOURS, sweepOrphanHeaderImages, sweepSentence, type OrphanAsset, type SweepClient } from './orphan-sweep';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const OLD = '2026-10-10T10:00:00.000Z';

const generatedMarked: OrphanAsset = { _id: 'image-aaaa-1376x768-jpg', originalFilename: 'custom-koozies-header.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: { name: BLOG_HEADER_ASSET_SOURCE }, _createdAt: OLD, size: 200000 };
const generatedLegacy: OrphanAsset = { _id: 'image-bbbb-1376x768-jpg', originalFilename: 'calendar-magnets-header-2.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: null, _createdAt: OLD, size: 180000 };
const patricks: OrphanAsset = { _id: 'image-cccc-1200x800-jpg', originalFilename: 'IMG_4471.jpg', mimeType: 'image/jpeg', width: 1200, height: 800, source: null, _createdAt: OLD, size: 900000 };
const migration: OrphanAsset = { _id: 'image-dddd-1376x768-jpg', originalFilename: 'hero.jpg', mimeType: 'image/jpeg', width: 1376, height: 768, source: { name: 'mpower-migration' }, _createdAt: OLD };

function fakeClient(candidates: OrphanAsset[], refsAtDelete: Record<string, number> = {}) {
  const deleted: string[] = [];
  const params: Record<string, unknown>[] = [];
  const client: SweepClient = {
    async fetch<T>(query: string, p: Record<string, unknown> = {}): Promise<T> {
      params.push(p);
      if (query.includes('sanity.imageAsset')) return candidates as T;
      if (query.startsWith('count(')) return (refsAtDelete[String(p.id)] ?? 0) as T;
      throw new Error('unknown query');
    },
    delete: vi.fn(async (id: string) => {
      if (refsAtDelete[id] === -1) throw new Error('Sanity refused: the asset is referenced');
      deleted.push(id);
    }),
  };
  return { client, deleted, params };
}

describe('sweepOrphanHeaderImages', () => {
  it('DRY RUN: lists the generated header pictures among the unreferenced old assets and deletes nothing', async () => {
    const { client, deleted, params } = fakeClient([generatedMarked, generatedLegacy, patricks, migration]);
    const report = await sweepOrphanHeaderImages(client, { commit: false, now: NOW });
    expect(report.unreferencedOlder).toBe(4);
    expect(report.generated.map((a) => a._id)).toEqual([generatedMarked._id, generatedLegacy._id]);
    expect(report.removed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(client.delete).not.toHaveBeenCalled();
    // The cut-off is 24 hours before now.
    expect(params[0].before).toBe(new Date(NOW.getTime() - ORPHAN_MIN_AGE_HOURS * 3600 * 1000).toISOString());
    expect(sweepSentence(report)).toContain('2 leftover generated header pictures');
    expect(sweepSentence(report)).toContain('nothing was removed');
  });

  it("Patrick's uploads and the migration leftovers are never in scope, whatever their size", async () => {
    const { client } = fakeClient([patricks, migration]);
    const report = await sweepOrphanHeaderImages(client, { commit: true, now: NOW });
    expect(report.generated).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(client.delete).not.toHaveBeenCalled();
    expect(sweepSentence(report)).toBe('Found no leftover generated header pictures; removed 0.');
  });

  it('COMMIT: re-counts references immediately before each delete; one that became referenced is kept, the rest removed one at a time', async () => {
    const { client, deleted } = fakeClient([generatedMarked, generatedLegacy], { [generatedLegacy._id]: 1 });
    const report = await sweepOrphanHeaderImages(client, { commit: true, now: NOW });
    expect(deleted).toEqual([generatedMarked._id]);
    expect(report.removed.map((a) => a._id)).toEqual([generatedMarked._id]);
    expect(report.kept).toEqual([{ asset: generatedLegacy, reason: 'referenced by 1 document(s) at the moment of deletion' }]);
    expect(sweepSentence(report)).toBe('Found 2 leftover generated header pictures (made for a post that no longer exists); removed 1, kept 1 that turned out to be in use.');
  });

  it("COMMIT: Sanity's own refusal is the belt and is reported as kept", async () => {
    const { client } = fakeClient([generatedMarked], { [generatedMarked._id]: -1 });
    const report = await sweepOrphanHeaderImages(client, { commit: true, now: NOW });
    expect(report.removed).toEqual([]);
    expect(report.kept[0].reason).toContain('refused');
  });

  it('a read that fails is on the report, never thrown', async () => {
    const client: SweepClient = { fetch: async () => { throw new Error('down'); }, delete: vi.fn() };
    const report = await sweepOrphanHeaderImages(client, { commit: true, now: NOW });
    expect(report.error).toContain('down');
    expect(sweepSentence(report)).toContain('could not run');
  });
});

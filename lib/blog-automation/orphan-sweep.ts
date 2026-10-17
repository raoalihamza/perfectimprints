/**
 * The weekly sweep of orphaned header pictures (AUTO-208, Part 8; FIX-920
 * wrote the plan). A generated header picture that NO document references
 * (drafts counted, raw perspective) and that is older than ORPHAN_MIN_AGE_HOURS
 * is a leftover: a deleted draft's picture, or a picture uploaded by a run
 * that was killed before its create. AUTO-207 closed the replace path and the
 * failed-create path; what those cannot catch, this finds.
 *
 * THE RULE, every condition required:
 *   1. the asset is one the chain generated, by AUTO-207's own rule
 *      (`isGeneratedHeaderAsset`: the upload marker, or the exact legacy
 *      fingerprint). Patrick's own uploads never match and are never listed;
 *   2. no document references it, in the raw perspective;
 *   3. it is older than 24 hours, which covers the upload-to-create gap and a
 *      Studio patch still in flight;
 *   4. on a COMMIT, the references are counted AGAIN immediately before each
 *      delete, one asset at a time, and Sanity's own refusal to delete a
 *      referenced asset is the belt under that.
 *
 * DRY RUN BY DEFAULT: the digest firing runs it dry and reports what it
 * would remove; deletion happens only when BLOG_ORPHAN_SWEEP_COMMIT is
 * `true` in the production environment (Ali's switch, after reading the
 * dry-run lines for a week or two), or when the script is run with
 * --commit. The 326 unreferenced assets that are NOT generated headers
 * (the June migration's leftovers) are never in scope.
 *
 * Client-agnostic; no next/*, no fs.
 */
import { isGeneratedHeaderAsset, type HeaderAssetFacts } from './discard-header-image';

export const ORPHAN_MIN_AGE_HOURS = 24;

/** Unreferenced image assets older than the cut-off, with the facts the rule reads. */
export const ORPHAN_CANDIDATES_QUERY = `*[_type == "sanity.imageAsset" && _createdAt < $before && count(*[references(^._id)]) == 0]{ _id, originalFilename, mimeType, "width": metadata.dimensions.width, "height": metadata.dimensions.height, source, _createdAt, size, url } | order(_createdAt asc)`;

export const REFERENCE_COUNT_QUERY = `count(*[references($id)])`;

export interface SweepClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<T>;
  delete(id: string): Promise<unknown>;
}

export interface OrphanAsset extends HeaderAssetFacts {
  _createdAt?: string;
  size?: number | null;
  url?: string | null;
}

export interface SweepReport {
  checkedAt: string;
  commit: boolean;
  /** Unreferenced image assets older than the cut-off, of any kind. */
  unreferencedOlder: number;
  /** Of those, generated header pictures: what a dry run would remove. */
  generated: OrphanAsset[];
  removed: OrphanAsset[];
  /** Kept on a commit: referenced again by the time of the re-count, or the delete was refused. */
  kept: { asset: OrphanAsset; reason: string }[];
  error: string | null;
}

export interface SweepOptions {
  commit: boolean;
  now?: Date;
  minAgeHours?: number;
  log?: (line: string) => void;
}

/** Run the sweep. Never throws: a failure is on the report. */
export async function sweepOrphanHeaderImages(client: SweepClient, opts: SweepOptions): Promise<SweepReport> {
  const now = opts.now ?? new Date();
  const before = new Date(now.getTime() - (opts.minAgeHours ?? ORPHAN_MIN_AGE_HOURS) * 3600 * 1000).toISOString();
  const log = opts.log ?? (() => {});
  const report: SweepReport = { checkedAt: now.toISOString(), commit: opts.commit, unreferencedOlder: 0, generated: [], removed: [], kept: [], error: null };
  let candidates: OrphanAsset[];
  try {
    candidates = (await client.fetch<OrphanAsset[] | null>(ORPHAN_CANDIDATES_QUERY, { before }, { cache: 'no-store' })) ?? [];
  } catch (err) {
    report.error = `The assets could not be read: ${err instanceof Error ? err.message : String(err)}`;
    return report;
  }
  report.unreferencedOlder = candidates.length;
  report.generated = candidates.filter(isGeneratedHeaderAsset);
  log(`[orphan-sweep] ${candidates.length} unreferenced image assets older than ${opts.minAgeHours ?? ORPHAN_MIN_AGE_HOURS} h; ${report.generated.length} generated header picture(s)`);
  if (!opts.commit) return report;
  for (const asset of report.generated) {
    try {
      const refs = await client.fetch<number>(REFERENCE_COUNT_QUERY, { id: asset._id }, { cache: 'no-store' });
      if ((refs ?? 0) > 0) {
        report.kept.push({ asset, reason: `referenced by ${refs} document(s) at the moment of deletion` });
        continue;
      }
      await client.delete(asset._id);
      report.removed.push(asset);
      log(`[orphan-sweep] removed ${asset._id} (${asset.originalFilename ?? ''})`);
    } catch (err) {
      report.kept.push({ asset, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

/** The sweep as one sentence for the digest. */
export function sweepSentence(report: SweepReport): string {
  if (report.error) return `The weekly tidy-up of leftover pictures could not run: ${report.error}`;
  const n = report.generated.length;
  const what = n === 0 ? 'no leftover generated header pictures' : `${n} leftover generated header picture${n === 1 ? '' : 's'} (made for a post that no longer exists)`;
  if (!report.commit) {
    return n === 0
      ? `Found ${what}. Nothing to remove.`
      : `Found ${what}; nothing was removed, because the tidy-up is in its look-only mode. Ali can switch removal on once these lines have looked right for a while.`;
  }
  return `Found ${what}; removed ${report.removed.length}${report.kept.length > 0 ? `, kept ${report.kept.length} that turned out to be in use` : ''}.`;
}

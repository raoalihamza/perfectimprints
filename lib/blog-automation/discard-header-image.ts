/**
 * Removing a generated header picture nobody uses any more (AUTO-207).
 *
 * FIX-920 counted 331 unreferenced image assets, five of them AI headers, and
 * traced the cause: NOTHING deleted a picture when it was replaced or when its
 * draft was deleted. Two of the five were left by "Generate another header
 * image", the button Patrick is about to press a great deal more. This module
 * closes the replace path and the failed-create path; the weekly sweep and the
 * June migration leftovers are the scheduler ticket's (FIX-920 wrote the
 * dry-run plan for those), and nothing here deletes anything retrospectively.
 *
 * THE RULE, all of it, and every condition must hold:
 *   1. the asset is one THIS MODULE generated: it carries the upload marker
 *      `source.name === BLOG_HEADER_ASSET_SOURCE` (set on every upload since
 *      AUTO-207), or, for the pictures generated before the marker existed,
 *      the exact fingerprint of one (`<slug>-header.jpg` or
 *      `<slug>-header-<n>.jpg`, JPEG, 1376 x 768, and no source of its own).
 *      An image Patrick uploaded has his filename and his dimensions, so it
 *      never matches, and is never touched;
 *   2. NO document references it, counted in the RAW perspective so a DRAFT's
 *      reference protects the picture as surely as a published one. A post
 *      whose published version still shows the old header keeps it: the old
 *      picture is still in use until he publishes, and the sweep is what
 *      finds it after that;
 *   3. Sanity itself agrees: an image field holds a strong reference, so the
 *      dataset refuses to delete an asset something still points at. That is
 *      the belt under rule 2, not a substitute for it.
 *
 * Never throws: every outcome is a value, and a picture that could not be
 * removed is a log line, never a failed button or a failed draft.
 *
 * PURE apart from the injected client: no Sanity import, no fs, no next/*, so
 * the Studio actions (the cookie-authed Studio client) and the server (the
 * token client, `createBlogDraftFromTopic`) call the same rule.
 */

/** The upload marker every generated header carries (`source.name` on the asset document). */
export const BLOG_HEADER_ASSET_SOURCE = 'perfect-imprints-blog-header';

/** The size every generated header is drawn at (1K, 16:9, on both image models: measured AUTO-202 and AUTO-206). */
export const GENERATED_HEADER_WIDTH = 1376;
export const GENERATED_HEADER_HEIGHT = 768;

/** `headerImageFilename`'s shape: `<slug>-header.jpg` or `<slug>-header-<n>.jpg`, the slug at most 60 characters. */
const GENERATED_HEADER_FILENAME = /^[a-z0-9-]{1,60}-header(?:-\d+)?\.jpg$/i;

/** What the rule reads about an asset document. */
export interface HeaderAssetFacts {
  _id: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  source?: { name?: string | null; id?: string | null } | null;
}

/** True when the asset is a header picture this module generated (rule 1). */
export function isGeneratedHeaderAsset(asset: HeaderAssetFacts | null | undefined): boolean {
  if (!asset || typeof asset._id !== 'string' || !asset._id.startsWith('image-')) return false;
  if (asset.source?.name === BLOG_HEADER_ASSET_SOURCE) return true;
  if (asset.source?.name) return false;
  return (
    GENERATED_HEADER_FILENAME.test(asset.originalFilename ?? '') &&
    (asset.mimeType ?? '').toLowerCase() === 'image/jpeg' &&
    asset.width === GENERATED_HEADER_WIDTH &&
    asset.height === GENERATED_HEADER_HEIGHT
  );
}

/** The one read the rule needs: the asset's facts and how many documents (drafts included) reference it. */
export const HEADER_ASSET_QUERY = `{
  "asset": *[_id == $id][0]{ _id, originalFilename, mimeType, "width": metadata.dimensions.width, "height": metadata.dimensions.height, source },
  "references": count(*[references($id)])
}`;

/** What the module needs from a Sanity client; both the Studio client and the server client satisfy it. RAW perspective is the caller's job (see `rawClient`). */
export interface AssetDiscardClient {
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>;
  delete(id: string): Promise<unknown>;
}

export type DiscardResult =
  | { deleted: true; assetId: string }
  | { deleted: false; assetId: string; reason: 'not-an-asset' | 'missing' | 'not-generated' | 'referenced' | 'error'; detail?: string };

/** An asset document id, or null (the value of `headerImage.asset._ref`). */
export function headerAssetId(ref: unknown): string | null {
  return typeof ref === 'string' && /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/.test(ref) ? ref : null;
}

/**
 * Delete the asset when, and only when, the rule above holds. One read, then
 * at most one delete. Never throws.
 */
export async function discardGeneratedHeaderImage(client: AssetDiscardClient, ref: unknown): Promise<DiscardResult> {
  const id = headerAssetId(ref);
  if (!id) return { deleted: false, assetId: String(ref ?? ''), reason: 'not-an-asset' };
  try {
    const facts = await client.fetch<{ asset: HeaderAssetFacts | null; references: number }>(HEADER_ASSET_QUERY, { id });
    if (!facts?.asset) return { deleted: false, assetId: id, reason: 'missing' };
    if (!isGeneratedHeaderAsset(facts.asset)) return { deleted: false, assetId: id, reason: 'not-generated' };
    if ((facts.references ?? 0) > 0) return { deleted: false, assetId: id, reason: 'referenced' };
    await client.delete(id);
    return { deleted: true, assetId: id };
  } catch (err) {
    // A delete Sanity refuses (the asset became referenced in the meantime) lands here too: kept, never forced.
    return { deleted: false, assetId: id, reason: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}

export interface DiscardAfterReplaceOptions {
  /** How many times to look before giving up (the Studio commits a patch a moment after `execute`). Default 8. */
  attempts?: number;
  /** Wait between looks, ms. Default 1,500. */
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The picture a Studio button has just REPLACED: the patch that took it off the
 * draft is committed a moment after `patch.execute`, so the rule is asked a few
 * times until the draft no longer points at it. A picture still referenced at
 * the end (the published post still shows it, or another post uses it) is
 * kept: that is rule 2 working, not a failure. A picture that is not one of
 * ours stops the loop at once.
 */
export async function discardReplacedHeaderImage(client: AssetDiscardClient, ref: unknown, opts: DiscardAfterReplaceOptions = {}): Promise<DiscardResult> {
  const attempts = Math.max(1, opts.attempts ?? 8);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: DiscardResult = { deleted: false, assetId: String(ref ?? ''), reason: 'not-an-asset' };
  for (let i = 0; i < attempts; i += 1) {
    last = await discardGeneratedHeaderImage(client, ref);
    if (last.deleted === true || last.reason !== 'referenced') return last;
    if (i < attempts - 1) await sleep(opts.waitMs ?? 1_500);
  }
  return last;
}

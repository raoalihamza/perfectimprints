/**
 * The picture "Change this picture" hands back to the image model (AUTO-220):
 * the copy of the post's generated header kept WITHOUT the P! mark
 * (`headerImage.unmarkedImage`), read from Sanity and fetched from the image
 * CDN. Server side.
 *
 * THE GUARD, and it is the point of this file. Both assets must be pictures
 * this site generated, by the upload marker on the asset document
 * (`isGeneratedHeaderAsset`, the rule the discard module uses):
 *   - the picture ON the post now (`currentRef`), and
 *   - the unmarked copy beside it (`unmarkedRef`).
 * When Patrick uploads his own image over a generated one, Studio swaps the
 * asset and KEEPS the fields beside it (AUTO-212 found this with the old
 * untitled copy), so the unmarked copy of a picture he has replaced can still
 * sit on the post. Without the first check, "Change this picture" would send
 * that OLD picture to the model and put the result over HIS upload. With it,
 * a post whose picture is his own is refused here, on the server, whatever
 * the browser sent; the Studio button is also disabled for such a post, but
 * that is the convenience and this is the rule.
 *
 * Nothing but the Sanity image CDN is ever fetched.
 */
import { headerAssetId, isGeneratedHeaderAsset, type HeaderAssetFacts } from './discard-header-image';

const ASSET_HOST = 'cdn.sanity.io';
const ASSET_FETCH_TIMEOUT_MS = 10_000;
const ASSET_MAX_BYTES = 12 * 1024 * 1024;

export interface EditBaseClient {
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>;
}

export type EditBaseResult =
  | { ok: true; picture: { mimeType: string; base64: string }; unmarkedId: string }
  | { ok: false; reason: string };

const FACTS_QUERY = `*[_id == $id][0]{ _id, url, originalFilename, mimeType, "width": metadata.dimensions.width, "height": metadata.dimensions.height, source }`;

export async function loadHeaderEditBase(
  client: EditBaseClient,
  refs: { currentRef: unknown; unmarkedRef: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<EditBaseResult> {
  const currentId = headerAssetId(refs.currentRef);
  if (!currentId) return { ok: false, reason: 'the post has no header picture to change' };
  const unmarkedId = headerAssetId(refs.unmarkedRef);
  if (!unmarkedId) {
    return { ok: false, reason: 'this picture was not made by the current header engine, so it cannot be changed; press Make a new picture instead' };
  }
  let current: HeaderAssetFacts | null;
  let unmarked: (HeaderAssetFacts & { url?: string | null }) | null;
  try {
    [current, unmarked] = await Promise.all([
      client.fetch<HeaderAssetFacts | null>(FACTS_QUERY, { id: currentId }),
      client.fetch<(HeaderAssetFacts & { url?: string | null }) | null>(FACTS_QUERY, { id: unmarkedId }),
    ]);
  } catch (err) {
    return { ok: false, reason: `the picture could not be read (${err instanceof Error ? err.message : String(err)})` };
  }
  // The picture ON the post must be one the site generated: an upload is the owner's and is never changed or replaced.
  if (!current || current.source?.name == null || !isGeneratedHeaderAsset(current)) {
    return { ok: false, reason: 'the picture on this post was uploaded by hand, not made by the site, so it is not changed and stays as it is' };
  }
  if (!unmarked) return { ok: false, reason: 'the copy of the picture without the logo no longer exists; press Make a new picture instead' };
  if (unmarked.source?.name == null || !isGeneratedHeaderAsset(unmarked)) {
    return { ok: false, reason: 'that image is not one the site generated, so it is not sent to the AI' };
  }
  let url: URL;
  try {
    url = new URL(unmarked.url ?? '');
  } catch {
    return { ok: false, reason: 'the picture has no usable address' };
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== ASSET_HOST) return { ok: false, reason: 'the picture is not on the image CDN' };
  const mimeType = (unmarked.mimeType ?? '').toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return { ok: false, reason: `the picture is ${mimeType || 'of an unknown type'}, which cannot be sent to the AI` };
  let bytes: Buffer;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(ASSET_FETCH_TIMEOUT_MS) });
    if (!res.ok) return { ok: false, reason: `the picture could not be fetched (HTTP ${res.status})` };
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { ok: false, reason: `the picture could not be fetched (${err instanceof Error ? err.message : String(err)})` };
  }
  if (bytes.length === 0 || bytes.length > ASSET_MAX_BYTES) return { ok: false, reason: 'the picture is empty or too large to send to the AI' };
  return { ok: true, picture: { mimeType, base64: bytes.toString('base64') }, unmarkedId };
}

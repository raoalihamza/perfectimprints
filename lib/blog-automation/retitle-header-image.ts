/**
 * Redrawing the title on a header picture the site already made (AUTO-209).
 *
 * A generated header carries the post's title, drawn by code, and keeps the
 * same picture WITHOUT the title beside it (`headerImage.untitledImage`).
 * When Patrick changes a post's title, the picture shows the old one; this
 * puts the current title on the kept copy, in the SAME placement and fill
 * (the stored `titleTreatment`), with NO model call and no cap slot: the
 * picture already passed the read-back check and the close look, and nothing
 * about it changes but our own lettering. Server side (it reads and uploads
 * an asset); the Studio button "Redraw title on header image" is the one
 * caller, through the generate-blog-image route.
 *
 * Only a picture THIS MODULE made is ever redrawn (the asset must carry the
 * upload marker, the rule in discard-header-image.ts), so an image Patrick
 * uploaded can never be written over, whatever the browser sends.
 */
import type { SanityClient } from '@sanity/client';
import { BLOG_HEADER_ASSET_SOURCE, headerAssetId, isGeneratedHeaderAsset, type HeaderAssetFacts } from './discard-header-image';
import { headerImageFilename, imageValueFor, titledHeaderImageAlt, type SanityImageValue } from './header-image';
import { parseStoredTreatment, storedTreatmentOf, type TitleLayoutAnswer, type TitleLayoutName } from './title-layout';

/** The untitled copy is fetched from Sanity's own image CDN and nowhere else. */
const ASSET_HOST = 'cdn.sanity.io';
const ASSET_FETCH_TIMEOUT_MS = 15_000;
const ASSET_MAX_BYTES = 12 * 1024 * 1024;

export interface RetitleArgs {
  client: SanityClient;
  /** `headerImage.untitledImage._ref`: the picture without the title. */
  untitledRef: unknown;
  /** The post's current title, drawn exactly. */
  title: string;
  /** The post's topic, for the alt text. */
  topic: string;
  /** `headerImage.titleTreatment` as stored, so the placement and fill are kept; absent or unreadable, the placement is chosen again. */
  treatment: unknown;
  slug: string;
  log?: (line: string) => void;
}

export type RetitleResult =
  | { ok: true; image: SanityImageValue; ms: number; layout: string; contrast: number; size: number; lines: number; placementKept: boolean }
  | { ok: false; reason: string };

/** The stored treatment as the plan's inputs: the exact layout to keep, and the product box the planner was given. */
export function answerFromTreatment(treatment: unknown): { forced: TitleLayoutName; answer: TitleLayoutAnswer } | null {
  const stored = parseStoredTreatment(treatment);
  if (!stored) return null;
  return {
    forced: stored.layout,
    answer: { productBox: stored.productBox, calmSide: null, reason: 'the look the picture was first drawn with' },
  };
}

export async function retitleHeaderImage(args: RetitleArgs): Promise<RetitleResult> {
  const log = args.log ?? (() => {});
  const id = headerAssetId(args.untitledRef);
  if (!id) return { ok: false, reason: 'the post has no untitled copy of its picture to redraw on' };
  const t0 = Date.now();
  const facts = await args.client.fetch<(HeaderAssetFacts & { url?: string | null }) | null>(
    `*[_id == $id][0]{ _id, url, originalFilename, mimeType, "width": metadata.dimensions.width, "height": metadata.dimensions.height, source }`,
    { id },
  );
  if (!facts) return { ok: false, reason: 'the untitled copy of the picture no longer exists; make a new picture instead' };
  if (!isGeneratedHeaderAsset(facts)) return { ok: false, reason: 'that image is not one the site generated, so no title is drawn on it' };
  let url: URL;
  try {
    url = new URL(facts.url ?? '');
  } catch {
    return { ok: false, reason: 'the untitled copy has no usable address' };
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== ASSET_HOST) return { ok: false, reason: 'the untitled copy is not on the image CDN' };
  const mimeType = (facts.mimeType ?? '').toLowerCase();
  if (!/^image\/(jpeg|png)$/.test(mimeType)) return { ok: false, reason: `the untitled copy is ${mimeType || 'of an unknown type'}, which cannot be drawn on` };

  let bytes: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ASSET_FETCH_TIMEOUT_MS) });
    if (!res.ok) return { ok: false, reason: `the untitled copy could not be fetched (HTTP ${res.status})` };
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { ok: false, reason: `the untitled copy could not be fetched (${err instanceof Error ? err.message : String(err)})` };
  }
  if (bytes.length === 0 || bytes.length > ASSET_MAX_BYTES) return { ok: false, reason: 'the untitled copy is empty or too large to draw on' };

  const stored = answerFromTreatment(args.treatment);
  const { composeTitledHeader } = await import('./compose-title');
  // The kept look first; when the current title no longer fits it, the look is chosen again from the rotation.
  let composed = stored
    ? await composeTitledHeader({ picture: { mimeType, base64: bytes.toString('base64') }, title: args.title, answer: stored.answer, seed: args.slug || args.title, forced: stored.forced })
    : null;
  if (!composed) composed = await composeTitledHeader({ picture: { mimeType, base64: bytes.toString('base64') }, title: args.title, answer: stored?.answer ?? null, seed: args.slug || args.title });
  if (!composed) return { ok: false, reason: 'the title has a character the title font cannot draw, or is empty, so it was not drawn' };
  const answer = stored?.answer ?? null;

  const filename = headerImageFilename(args.slug, 1, 'titled');
  const asset = await args.client.assets.upload('image', composed.bytes, {
    filename,
    contentType: composed.mimeType,
    source: { name: BLOG_HEADER_ASSET_SOURCE, id: filename },
  });
  const image: SanityImageValue = {
    ...imageValueFor(asset._id, titledHeaderImageAlt(composed.plan.title, args.topic)),
    titleOnImage: composed.plan.title,
    untitledImage: { _type: 'reference', _ref: id },
    titleTreatment: JSON.stringify(storedTreatmentOf(composed.plan, answer)),
  };
  const placementKept = stored?.forced === composed.plan.layout;
  log(`[retitle] ${composed.plan.layout} kept=${placementKept} size=${composed.plan.text.size} ms=${Date.now() - t0}`);
  return {
    ok: true,
    image,
    ms: Date.now() - t0,
    layout: composed.plan.layout,
    contrast: composed.plan.contrast,
    size: composed.plan.text.size,
    lines: composed.plan.text.lines.length,
    placementKept,
  };
}

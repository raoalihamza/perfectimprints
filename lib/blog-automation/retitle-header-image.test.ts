/**
 * AUTO-209: redrawing the title on a kept untitled copy, with the Sanity
 * client and the CDN fetch faked and the REAL compositor drawing. What must
 * hold: only a picture the site generated (the upload marker) is ever drawn
 * on; the copy comes from the image CDN and nowhere else; the stored
 * treatment reproduces the placement; the new asset carries the marker and
 * the post's value points at the SAME untitled copy; nothing is uploaded on
 * a refusal.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ImageResponse } from 'next/og';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';
import { answerFromTreatment, retitleHeaderImage } from './retitle-header-image';
import { parseStoredTreatment } from './title-layout';

const UNTITLED = 'image-abcdef0123456789abcdef0123456789abcdef01-1376x768-jpg';

async function flatPng(): Promise<Buffer> {
  const el = { type: 'div', props: { style: { width: 1376, height: 768, display: 'flex', backgroundColor: '#dfe6ee' } }, key: null } as unknown as React.ReactElement;
  return Buffer.from(await new ImageResponse(el, { width: 1376, height: 768 }).arrayBuffer());
}

interface FakeOpts {
  facts?: Record<string, unknown> | null;
  fetchStatus?: number;
}

function fakeClient(opts: FakeOpts = {}) {
  const uploads: { bytes: Buffer; options: Record<string, unknown> }[] = [];
  const facts =
    opts.facts === undefined
      ? { _id: UNTITLED, url: `https://cdn.sanity.io/images/x/production/${UNTITLED.slice(6)}.jpg`, originalFilename: 'custom-pens-header-photo.jpg', mimeType: 'image/png', width: 1376, height: 768, source: { name: BLOG_HEADER_ASSET_SOURCE, id: 'x' } }
      : opts.facts;
  const client = {
    fetch: async () => facts,
    assets: {
      upload: async (_kind: string, bytes: Buffer, options: Record<string, unknown>) => {
        uploads.push({ bytes, options });
        return { _id: `image-new${uploads.length}-1376x768-png` };
      },
    },
  };
  return { client: client as never, uploads };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(bytes: Buffer, status = 200) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(status === 200 ? new Uint8Array(bytes) : 'no', { status, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;
  return calls;
}

describe('retitleHeaderImage (AUTO-209)', () => {
  it('draws the current title on the kept copy in the stored placement, uploads it with the marker, and points the value at the same copy', async () => {
    const png = await flatPng();
    const calls = fakeFetch(png);
    const { client, uploads } = fakeClient();
    const treatment = JSON.stringify({ layout: 'panel-left', productBox: [400, 500, 1000, 1000] });
    const result = await retitleHeaderImage({ client, untitledRef: UNTITLED, title: 'Custom Pens for Trade Shows', topic: 'custom pens', treatment, slug: 'custom-pens' });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error('unreachable');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^https:\/\/cdn\.sanity\.io\//);
    expect(result.layout).toBe('panel-left');
    expect(result.placementKept).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].options).toMatchObject({ filename: 'custom-pens-header.png', contentType: 'image/png', source: { name: BLOG_HEADER_ASSET_SOURCE } });
    expect(uploads[0].bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(result.image.asset._ref).toBe('image-new1-1376x768-png');
    expect(result.image.untitledImage).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: UNTITLED } });
    expect(result.image.titleOnImage).toBe('Custom Pens for Trade Shows');
    expect(result.image.alt).toContain('Custom Pens for Trade Shows.');
    expect(parseStoredTreatment(result.image.titleTreatment)?.layout).toBe('panel-left');
  }, 30_000);

  it('with no readable treatment the placement is chosen again, and the title still goes on', async () => {
    fakeFetch(await flatPng());
    const { client, uploads } = fakeClient();
    const result = await retitleHeaderImage({ client, untitledRef: UNTITLED, title: 'Custom Pens', topic: 'custom pens', treatment: 'garbage', slug: 'custom-pens' });
    expect(result.ok).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(answerFromTreatment('garbage')).toBeNull();
  }, 30_000);

  it('refuses an image that is not one the site generated, and uploads nothing', async () => {
    const calls = fakeFetch(await flatPng());
    const { client, uploads } = fakeClient({ facts: { _id: UNTITLED, url: 'https://cdn.sanity.io/images/x/production/a.jpg', originalFilename: 'patricks-photo.jpg', mimeType: 'image/jpeg', width: 1600, height: 900, source: null } });
    const result = await retitleHeaderImage({ client, untitledRef: UNTITLED, title: 'Custom Pens', topic: 'custom pens', treatment: null, slug: 'custom-pens' });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('not one the site generated') });
    expect(calls).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });

  it('refuses a missing copy, a malformed id, a copy off the image CDN, and a fetch that fails', async () => {
    const png = await flatPng();
    fakeFetch(png);
    expect((await retitleHeaderImage({ client: fakeClient({ facts: null }).client, untitledRef: UNTITLED, title: 'T', topic: 't', treatment: null, slug: 's' })).ok).toBe(false);
    expect((await retitleHeaderImage({ client: fakeClient().client, untitledRef: 'not-an-id', title: 'T', topic: 't', treatment: null, slug: 's' })).ok).toBe(false);
    const offCdn = fakeClient({ facts: { _id: UNTITLED, url: 'https://evil.example/a.png', mimeType: 'image/png', source: { name: BLOG_HEADER_ASSET_SOURCE } } });
    const off = await retitleHeaderImage({ client: offCdn.client, untitledRef: UNTITLED, title: 'T', topic: 't', treatment: null, slug: 's' });
    expect(off).toMatchObject({ ok: false, reason: expect.stringContaining('image CDN') });
    expect(offCdn.uploads).toHaveLength(0);
    fakeFetch(png, 500);
    const failed = await retitleHeaderImage({ client: fakeClient().client, untitledRef: UNTITLED, title: 'T', topic: 't', treatment: null, slug: 's' });
    expect(failed).toMatchObject({ ok: false, reason: expect.stringContaining('HTTP 500') });
  });

  it('an undrawable title uploads nothing and says why', async () => {
    fakeFetch(await flatPng());
    const { client, uploads } = fakeClient();
    const result = await retitleHeaderImage({ client, untitledRef: UNTITLED, title: 'Custom 中 Pens', topic: 'custom pens', treatment: null, slug: 'custom-pens' });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('cannot draw') });
    expect(uploads).toHaveLength(0);
  });

  it('a stored treatment becomes the forced layout and the product box the planner was given; an AUTO-209 treatment is not one', () => {
    expect(answerFromTreatment({ layout: 'lower-third', productBox: [1, 2, 3, 4] })).toEqual({ forced: 'lower-third', answer: { productBox: [1, 2, 3, 4], calmSide: null, reason: 'the look the picture was first drawn with' } });
    expect(answerFromTreatment({ layout: 'gradient-right', productBox: null })).toMatchObject({ forced: 'gradient-right', answer: { productBox: null } });
    expect(answerFromTreatment({ layout: 'band-bottom', colour: 'red', productBox: [1, 2, 3, 4] })).toBeNull();
  });

  it('a title that no longer fits the kept look (a lockup for a title with nothing to set large) gets a look chosen again, and says so', async () => {
    fakeFetch(await flatPng());
    const { client, uploads } = fakeClient();
    const result = await retitleHeaderImage({ client, untitledRef: UNTITLED, title: 'Are Custom Pens Worth It?', topic: 'custom pens', treatment: JSON.stringify({ layout: 'lockup-left', productBox: null }), slug: 'custom-pens' });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error('unreachable');
    expect(result.placementKept).toBe(false);
    expect(result.layout).not.toBe('lockup-left');
    expect(uploads).toHaveLength(1);
  }, 30_000);
});

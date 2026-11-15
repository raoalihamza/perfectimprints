/**
 * AUTO-220: the guard on "Change this picture". The picture ON the post and
 * the copy sent to the AI must both be ones the site generated, by the upload
 * marker. This is the test that an image Patrick uploaded, or one he put over
 * a generated picture, can never be changed or replaced by this path.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadHeaderEditBase } from './header-edit-base';
import { BLOG_HEADER_ASSET_SOURCE } from './discard-header-image';

const OURS = 'image-aaaa1111-1536x864-png';
const COPY = 'image-bbbb2222-1536x864-jpg';
const HIS = 'image-cccc3333-1661x947-avif';

interface Asset {
  _id: string;
  url?: string;
  mimeType?: string;
  originalFilename?: string;
  width?: number;
  height?: number;
  source?: { name?: string } | null;
}

function client(assets: Asset[]) {
  return { fetch: vi.fn(async (_q: string, params: Record<string, unknown>) => (assets.find((a) => a._id === params.id) ?? null) as never) };
}
const marked = (id: string, mimeType: string): Asset => ({ _id: id, url: `https://cdn.sanity.io/images/p/production/${id}.jpg`, mimeType, source: { name: BLOG_HEADER_ASSET_SOURCE } });
const okFetch = (async () => new Response(Buffer.from('picturebytes'), { status: 200 })) as unknown as typeof fetch;

describe('the picture sent back to the AI', () => {
  it('is the copy without the mark, when both it and the picture on the post are the site\'s own', async () => {
    const out = await loadHeaderEditBase(client([marked(OURS, 'image/png'), marked(COPY, 'image/jpeg')]), { currentRef: OURS, unmarkedRef: COPY }, okFetch);
    expect(out).toEqual({ ok: true, picture: { mimeType: 'image/jpeg', base64: Buffer.from('picturebytes').toString('base64') }, unmarkedId: COPY });
  });

  it("PATRICK'S OWN UPLOAD IS NEVER CHANGED: Studio keeps the old copy beside his new asset, and the server still refuses", async () => {
    // The state AUTO-212 found on 11 published posts: his upload on the post, a generated picture's fields left beside it.
    const fetchSpy = vi.fn(okFetch);
    const his: Asset = { _id: HIS, url: 'https://cdn.sanity.io/images/p/production/his.avif', mimeType: 'image/avif', originalFilename: 'pens-header-final.avif', width: 1661, height: 947, source: null };
    const out = await loadHeaderEditBase(client([his, marked(COPY, 'image/jpeg')]), { currentRef: HIS, unmarkedRef: COPY }, fetchSpy as never);
    expect(out).toEqual({ ok: false, reason: 'the picture on this post was uploaded by hand, not made by the site, so it is not changed and stays as it is' });
    // Nothing was fetched, so nothing can have been sent anywhere.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an upload is refused even when it has the size and the name of a generated picture (the marker is the rule, not the look)', async () => {
    const lookalike: Asset = { _id: OURS, url: 'https://cdn.sanity.io/x.png', mimeType: 'image/png', originalFilename: 'custom-pens-header.png', width: 1536, height: 864, source: null };
    const out = await loadHeaderEditBase(client([lookalike, marked(COPY, 'image/jpeg')]), { currentRef: OURS, unmarkedRef: COPY }, okFetch);
    expect(out.ok).toBe(false);
    // A picture from before the marker existed (the old fingerprint: a 1376 x 768 JPEG named -header.jpg) is not changed either.
    const old: Asset = { _id: 'image-dddd4444-1376x768-jpg', url: 'https://cdn.sanity.io/o.jpg', mimeType: 'image/jpeg', originalFilename: 'custom-pens-header.jpg', width: 1376, height: 768 };
    expect((await loadHeaderEditBase(client([old, marked(COPY, 'image/jpeg')]), { currentRef: old._id, unmarkedRef: COPY }, okFetch)).ok).toBe(false);
  });

  it('a copy that is not the site\'s own is never sent, whatever is on the post', async () => {
    const stranger: Asset = { _id: COPY, url: 'https://cdn.sanity.io/s.jpg', mimeType: 'image/jpeg', source: { name: 'unsplash' } };
    const out = await loadHeaderEditBase(client([marked(OURS, 'image/png'), stranger]), { currentRef: OURS, unmarkedRef: COPY }, okFetch);
    expect(out).toEqual({ ok: false, reason: 'that image is not one the site generated, so it is not sent to the AI' });
  });

  it('refuses a post with no picture, a picture with no copy, a copy that is gone, and ids that are not asset ids', async () => {
    const c = client([marked(OURS, 'image/png')]);
    expect(await loadHeaderEditBase(c, { currentRef: null, unmarkedRef: COPY }, okFetch)).toMatchObject({ ok: false, reason: 'the post has no header picture to change' });
    expect((await loadHeaderEditBase(c, { currentRef: OURS, unmarkedRef: undefined }, okFetch)).ok).toBe(false);
    expect(await loadHeaderEditBase(c, { currentRef: OURS, unmarkedRef: COPY }, okFetch)).toMatchObject({ ok: false, reason: 'the copy of the picture without the logo no longer exists; press Make a new picture instead' });
    expect((await loadHeaderEditBase(c, { currentRef: 'https://evil.example/x.png', unmarkedRef: COPY }, okFetch)).ok).toBe(false);
    expect((await loadHeaderEditBase(c, { currentRef: OURS, unmarkedRef: '../../etc/passwd' }, okFetch)).ok).toBe(false);
  });

  it('fetches from the Sanity image CDN and nowhere else', async () => {
    const fetchSpy = vi.fn(okFetch);
    const elsewhere = { ...marked(COPY, 'image/jpeg'), url: 'https://example.com/picture.jpg' };
    const out = await loadHeaderEditBase(client([marked(OURS, 'image/png'), elsewhere]), { currentRef: OURS, unmarkedRef: COPY }, fetchSpy as never);
    expect(out).toEqual({ ok: false, reason: 'the picture is not on the image CDN' });
    expect(fetchSpy).not.toHaveBeenCalled();
    const http = { ...marked(COPY, 'image/jpeg'), url: 'http://cdn.sanity.io/picture.jpg' };
    expect((await loadHeaderEditBase(client([marked(OURS, 'image/png'), http]), { currentRef: OURS, unmarkedRef: COPY }, fetchSpy as never)).ok).toBe(false);
  });

  it('a failed read or a failed fetch is a refusal, never a throw', async () => {
    const broken = { fetch: vi.fn(async () => { throw new Error('socket hang up'); }) };
    expect(await loadHeaderEditBase(broken as never, { currentRef: OURS, unmarkedRef: COPY }, okFetch)).toEqual({ ok: false, reason: 'the picture could not be read (socket hang up)' });
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadHeaderEditBase(client([marked(OURS, 'image/png'), marked(COPY, 'image/jpeg')]), { currentRef: OURS, unmarkedRef: COPY }, notFound)).toEqual({ ok: false, reason: 'the picture could not be fetched (HTTP 404)' });
  });
});

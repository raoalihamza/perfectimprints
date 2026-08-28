/**
 * IMG-110: the structured-data / social image size rule.
 *
 * SNIP-170 found that `largeSocialImage` only ever upsized Geiger URLs, so the
 * images Patrick uploads for his own products reached Google at the `w=400`
 * their card normaliser produces, while 1500px or larger versions sat unused.
 * These tests pin both halves of the fix: the Geiger branch must stay
 * byte-identical, and the Sanity branch must widen the URL WITHOUT ever asking
 * for pixels the stored asset does not have.
 *
 * The two guards are not stylistic. Measured against the live Sanity CDN on
 * 2026-08-29: `w=1200&fit=max` on a 768x768 asset returns the true 768x768
 * original, but `w=1200` WITHOUT `fit=max` returns a fabricated 1200x1200
 * upscale of it (113,446 bytes of invented detail). So the presence of
 * `fit=max` is load-bearing, and the intrinsic-width clamp is the second,
 * independent guarantee that survives a future caller changing the fit mode.
 */
import { describe, expect, it } from 'vitest';

import { largeSocialImage } from './open-graph';

const S = 'https://cdn.sanity.io/images/ii96lcy9/production';

describe('largeSocialImage: Geiger branch is unchanged', () => {
  it('rewrites every size param on a Geiger thumbnail to 1200', () => {
    expect(
      largeSocialImage(
        'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=275&w=275&h=275',
      ),
    ).toBe(
      'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200',
    );
  });

  it('leaves an already-1200 Geiger URL exactly as it is', () => {
    const url =
      'https://imgsirv.geiger.com/master/101148/web/101148_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200';
    expect(largeSocialImage(url)).toBe(url);
  });

  it('does not touch a Geiger URL that carries no size params', () => {
    const url = 'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg';
    expect(largeSocialImage(url)).toBe(url);
  });
});

describe('largeSocialImage: Sanity branch widens toward 1200', () => {
  it('raises w=400 to w=1200 on an asset that is large enough', () => {
    expect(largeSocialImage(`${S}/abc-1500x1500.jpg?w=400&fit=max`)).toBe(
      `${S}/abc-1500x1500.jpg?w=1200&fit=max`,
    );
  });

  it('keeps every other query parameter intact', () => {
    expect(largeSocialImage(`${S}/abc-1600x1600.jpg?w=400&fm=jpg&fit=max`)).toBe(
      `${S}/abc-1600x1600.jpg?w=1200&fm=jpg&fit=max`,
    );
  });

  it('works when fit=max is not the last parameter', () => {
    expect(largeSocialImage(`${S}/abc-2000x2000.jpg?fit=max&w=400`)).toBe(
      `${S}/abc-2000x2000.jpg?fit=max&w=1200`,
    );
  });

  it('handles a non-square asset by width alone, so the aspect ratio is kept', () => {
    expect(largeSocialImage(`${S}/abc-2000x990.jpg?w=400&fit=max`)).toBe(
      `${S}/abc-2000x990.jpg?w=1200&fit=max`,
    );
  });

  it('raises an avif asset the same way', () => {
    expect(largeSocialImage(`${S}/abc-1200x1200.avif?w=400&fit=max`)).toBe(
      `${S}/abc-1200x1200.avif?w=1200&fit=max`,
    );
  });
});

describe('largeSocialImage: it never asks for pixels that do not exist', () => {
  it('clamps to the stored width of a small asset instead of requesting 1200', () => {
    expect(largeSocialImage(`${S}/abc-768x768.webp?w=400&fit=max`)).toBe(
      `${S}/abc-768x768.webp?w=768&fit=max`,
    );
  });

  // The function only ever WIDENS. An asset narrower than the width already
  // being requested needs no rewrite: verified live against the real
  // ps750-emt asset, w=390, w=400 and w=1200 all return the identical
  // 26,636-byte 390x750 original, so narrowing the URL would change the text
  // and nothing else.
  it('leaves an asset narrower than the width already requested untouched', () => {
    const url = `${S}/abc-390x750.jpg?w=400&fit=max`;
    expect(largeSocialImage(url)).toBe(url);
  });

  it('leaves the URL alone when the request is already at or above the asset width', () => {
    const url = `${S}/abc-640x640.jpg?w=640&fit=max`;
    expect(largeSocialImage(url)).toBe(url);
  });

  it('leaves the URL alone when it already asks for 1200 or more', () => {
    const url = `${S}/abc-1500x1500.jpg?w=1200&fit=max`;
    expect(largeSocialImage(url)).toBe(url);
    const bigger = `${S}/abc-1500x1500.jpg?w=1400&fit=max`;
    expect(largeSocialImage(bigger)).toBe(bigger);
  });

  it('refuses to widen without fit=max, because the CDN would fabricate an upscale', () => {
    const url = `${S}/abc-1500x1500.jpg?w=400`;
    expect(largeSocialImage(url)).toBe(url);
    const cropped = `${S}/abc-1500x1500.jpg?w=400&fit=crop`;
    expect(largeSocialImage(cropped)).toBe(cropped);
  });

  it('is not fooled by fit=max appearing as a prefix of another value', () => {
    const url = `${S}/abc-1500x1500.jpg?w=400&fit=maximum`;
    expect(largeSocialImage(url)).toBe(url);
  });

  it('leaves a URL with no width parameter alone, since it already resolves full size', () => {
    const url = `${S}/abc-1500x1500.jpg?fit=max`;
    expect(largeSocialImage(url)).toBe(url);
  });

  it('falls back to 1200 under the fit=max guarantee when the filename carries no dimensions', () => {
    expect(largeSocialImage(`${S}/abc.jpg?w=400&fit=max`)).toBe(`${S}/abc.jpg?w=1200&fit=max`);
  });
});

describe('largeSocialImage: host handling', () => {
  it('returns null for a missing image', () => {
    expect(largeSocialImage(null)).toBeNull();
    expect(largeSocialImage(undefined)).toBeNull();
    expect(largeSocialImage('')).toBeNull();
  });

  it('leaves an unrelated host untouched even when it looks resizable', () => {
    const url = 'https://images.example.com/photo-1500x1500.jpg?w=400&fit=max';
    expect(largeSocialImage(url)).toBe(url);
  });

  it('is not fooled by a host that merely ends with the Sanity name', () => {
    const url = 'https://cdn.sanity.io.evil.test/images/x/abc-1500x1500.jpg?w=400&fit=max';
    expect(largeSocialImage(url)).toBe(url);
  });

  it('is not fooled by the Sanity host hidden in a query string', () => {
    const url = 'https://evil.test/x-1500x1500.jpg?w=400&fit=max&host=cdn.sanity.io';
    expect(largeSocialImage(url)).toBe(url);
  });

  it('leaves the branded PNG social fallback alone', () => {
    const url = 'https://www.perfectimprints.com/og-default.png';
    expect(largeSocialImage(url)).toBe(url);
  });

  it('leaves a relative or unparseable value alone rather than throwing', () => {
    expect(largeSocialImage('/placeholder-product.svg')).toBe('/placeholder-product.svg');
    expect(largeSocialImage('not a url at all')).toBe('not a url at all');
  });
});

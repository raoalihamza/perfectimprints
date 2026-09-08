/**
 * PORT-110: the server-side tile mapper, run through the REAL Sanity URL
 * builder (with a placeholder project id, since no env is set under vitest).
 * Asserts three things that matter on the deployed page:
 *   - every rendered URL asks the CDN for a modern format (`auto=format`,
 *     IMG-120) and no SEO URL does (og:image, sitemap);
 *   - no URL ever names more pixels than the asset has, and every URL is
 *     `fit=max` at natural aspect (PORT-150: the tile fits the whole image;
 *     `fit=crop` and `fit=fill` both upscale, see image-sizes.test.ts);
 *   - a missing or unreadable asset yields no tile rather than a crash.
 */
import { describe, expect, it } from 'vitest';

import type { PortfolioItemCard } from './gallery';
import { TILE_SIZES, embeddedTileSizes, lightboxSizesFor, scaleSizes } from './image-sizes';
import {
  portfolioRepresentativeImage,
  portfolioSitemapImages,
  toPortfolioTile,
  toPortfolioTiles,
} from './tile-data';

function item(ref: string | null, extra: Partial<NonNullable<PortfolioItemCard['image']>> = {}, fields: Partial<PortfolioItemCard> = {}): PortfolioItemCard {
  return {
    _id: 'item-1',
    title: 'Embroidered caps for a fire department',
    image: ref
      ? { _type: 'image', asset: { _ref: ref, _type: 'reference' }, alt: 'Navy embroidered caps', ...extra }
      : { _type: 'image', alt: 'No asset' },
    category: { _id: 'c1', title: 'Caps and Hats', slug: 'caps-and-hats' },
    colors: ['blue', 'white', 'navy'],
    description: '  Twelve caps, front embroidery.  ',
    clientName: null,
    ...fields,
  };
}

const params = (url: string) => new URL(url).searchParams;
const widthsOf = (srcSet: string) => srcSet.split(', ').map((e) => Number(e.split(' ')[1].replace('w', '')));
const urlsOf = (srcSet: string) => srcSet.split(', ').map((e) => e.split(' ')[0]);

describe('toPortfolioTile', () => {
  it('maps the fields and normalises the colours to the vocabulary', () => {
    const tile = toPortfolioTile(item('image-abc123-1500x1500-jpg'))!;
    expect(tile.id).toBe('item-1');
    expect(tile.title).toBe('Embroidered caps for a fire department');
    expect(tile.alt).toBe('Navy embroidered caps');
    expect(tile.description).toBe('Twelve caps, front embroidery.');
    expect(tile.clientName).toBeNull();
    expect(tile.category).toEqual({ slug: 'caps-and-hats', title: 'Caps and Hats' });
    expect(tile.colors).toEqual(['blue', 'white']);
    // PORT-160: absent on the item, empty on the tile (never undefined).
    expect(tile.decorationMethods).toEqual([]);
    expect(tile.industry).toBeNull();
  });

  it('normalises the decoration methods and the industry to their vocabularies (PORT-160)', () => {
    const tile = toPortfolioTile(
      item('image-abc123-1500x1500-jpg', {}, {
        decorationMethods: ['screen-printed', 'sublimated', 'embroidered'],
        industry: 'fire-and-ems',
      }),
    )!;
    expect(tile.decorationMethods).toEqual(['embroidered', 'screen-printed']);
    expect(tile.industry).toBe('fire-and-ems');
    expect(toPortfolioTile(item('image-abc123-1500x1500-jpg', {}, { industry: 'Military' }))!.industry).toBeNull();
  });

  it('falls back to the title for alt and drops a blank description', () => {
    const tile = toPortfolioTile(item('image-abc123-1500x1500-jpg', { alt: '  ' }, { description: ' ' }))!;
    expect(tile.alt).toBe('Embroidered caps for a fire department');
    expect(tile.description).toBeNull();
  });

  it('builds the tile at natural aspect with fit=max, never a height, every width clamped to the asset width (PORT-150)', () => {
    const tile = toPortfolioTile(item('image-abc123-1661x947-jpg'))!;
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640, 800, 960]);
    for (const url of urlsOf(tile.image.srcSet)) {
      const p = params(url);
      expect(p.get('fit')).toBe('max');
      expect(p.get('h')).toBeNull();
      expect(p.get('auto')).toBe('format');
      expect(Number(p.get('w'))).toBeLessThanOrEqual(1661);
      // No crop stored, so no rect: the whole picture is requested.
      expect(p.get('rect')).toBeNull();
    }
    // width/height describe the natural aspect of the src candidate (CLS).
    expect(tile.image.width).toBe(640);
    expect(tile.image.height).toBe(365);
    expect(params(tile.image.src).get('w')).toBe('640');
    // A wide image spans the full tile width, so sizes is the plain grid value.
    expect(tile.image.sizes).toBe(TILE_SIZES);
  });

  it('a tall image keeps its natural aspect and scales its sizes to the width it will actually occupy', () => {
    // The 3.1:1 bottle photograph from the PORT-140 set.
    const tile = toPortfolioTile(item('image-abc123-726x2252-png'))!;
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640]);
    for (const url of urlsOf(tile.image.srcSet)) {
      expect(params(url).get('fit')).toBe('max');
      expect(params(url).get('h')).toBeNull();
    }
    expect(tile.image).toMatchObject({ width: 640, height: 1985 });
    expect(tile.image.sizes).toBe(scaleSizes(TILE_SIZES, 0.322));
    expect(tile.image.sizes).toContain('calc(50vw * 0.322)');
    // The lightbox is untouched by the tile rule.
    expect(tile.large.sizes).toBe(lightboxSizesFor({ width: 726, height: 2252 }));
    expect(widthsOf(tile.large.srcSet)).toEqual([726]);
  });

  it('a stored crop frame still applies, to the tile and the lightbox alike, and the clamp follows the cropped width', () => {
    const tile = toPortfolioTile(
      item('image-abc123-1661x947-jpg', { crop: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 } }),
    )!;
    // 1661 * 0.8 = 1328 wide after the crop: 960 still fits the tile, 1600 no longer fits the lightbox.
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640, 800, 960]);
    expect(widthsOf(tile.large.srcSet)).toEqual([800, 1200]);
    for (const url of [...urlsOf(tile.image.srcSet), ...urlsOf(tile.large.srcSet)]) {
      // The builder emits the crop rectangle for a fit=max request too: the
      // Studio crop handles are a real edit of the picture everywhere.
      expect(params(url).get('rect')).toMatch(/^\d+,\d+,\d+,\d+$/);
      expect(params(url).get('fit')).toBe('max');
    }
    expect(tile.image).toMatchObject({ width: 640, height: 365 });
    expect(tile.large.width).toBe(1200);
    expect(tile.large.height).toBe(684);
  });

  it('a hotspot alone changes nothing: with no height requested the builder has no crop to centre', () => {
    const plain = toPortfolioTile(item('image-abc123-1661x947-jpg'))!;
    const spotted = toPortfolioTile(
      item('image-abc123-1661x947-jpg', { hotspot: { x: 0.2, y: 0.8, width: 0.3, height: 0.3 } }),
    )!;
    expect(spotted.image.srcSet).toBe(plain.image.srcSet);
    expect(spotted.large.srcSet).toBe(plain.large.srcSet);
  });

  it('builds the lightbox at natural aspect with fit=max, never above the asset width', () => {
    const tile = toPortfolioTile(item('image-abc123-1500x1500-jpg'))!;
    expect(widthsOf(tile.large.srcSet)).toEqual([800, 1200]);
    for (const url of urlsOf(tile.large.srcSet)) {
      const p = params(url);
      expect(p.get('fit')).toBe('max');
      expect(p.get('h')).toBeNull();
      expect(p.get('auto')).toBe('format');
    }
    // sizes states BOTH limits the viewer enforces (row width and 70vh), from the aspect.
    expect(tile.large.sizes).toBe('min(calc(100vw - 168px), calc(70vh * 1))');
    expect(tile.large).toMatchObject({ width: 1200, height: 1200 });

    const wide = toPortfolioTile(item('image-abc123-1661x947-jpg'))!;
    expect(widthsOf(wide.large.srcSet)).toEqual([800, 1200, 1600]);
    expect(wide.large).toMatchObject({ width: 1200, height: 684 });
    expect(wide.large.sizes).toBe('min(calc(100vw - 168px), calc(70vh * 1.754))');
  });

  it('serves a tiny asset at its own true size in both modes', () => {
    const tile = toPortfolioTile(item('image-abc123-390x750-png'))!;
    expect(widthsOf(tile.image.srcSet)).toEqual([320]);
    expect(tile.image).toMatchObject({ width: 320, height: 615 });
    expect(tile.image.sizes).toBe(scaleSizes(TILE_SIZES, 0.52));
    expect(widthsOf(tile.large.srcSet)).toEqual([390]);
    expect(tile.large).toMatchObject({ width: 390, height: 750 });
  });

  it('never names more pixels than the asset has, in either image, for any shape', () => {
    for (const [w, h] of [[726, 2252], [1098, 688], [1200, 1200], [300, 300], [2212, 2176], [558, 1654]]) {
      const tile = toPortfolioTile(item(`image-abc123-${w}x${h}-png`))!;
      for (const url of [...urlsOf(tile.image.srcSet), ...urlsOf(tile.large.srcSet)]) {
        const p = params(url);
        expect(Number(p.get('w'))).toBeLessThanOrEqual(w);
        expect(p.get('h')).toBeNull();
        expect(p.get('fit')).toBe('max');
      }
      expect(tile.image.width).toBeLessThanOrEqual(w);
      expect(tile.image.height).toBeLessThanOrEqual(h);
    }
  });

  it('yields no tile for a missing or unreadable asset, and never throws', () => {
    expect(toPortfolioTile(item(null))).toBeNull();
    expect(toPortfolioTile(item('image-abc123-jpg'))).toBeNull();
    expect(toPortfolioTile({ _id: 'x', title: 'No image at all' })).toBeNull();
    expect(toPortfolioTile({ _id: 'x', title: 'Null image', image: null })).toBeNull();
  });
});

describe('the SEO images use the plain builder', () => {
  const items = [item(null), item('image-abc123-1500x1500-jpg'), item('image-def456-800x600-jpg')];

  it('representative image is the first item with an asset, at the card size, without auto=format', () => {
    const url = portfolioRepresentativeImage(items)!;
    expect(url).toContain('abc123-1500x1500.jpg');
    const p = params(url);
    expect(p.get('w')).toBe('400');
    expect(p.get('fit')).toBe('max');
    expect(p.get('auto')).toBeNull();
    expect(portfolioRepresentativeImage([])).toBeNull();
    expect(portfolioRepresentativeImage([item(null)])).toBeNull();
  });

  it('sitemap images are one per item with an asset, at 1200 fit=max, without auto=format', () => {
    const urls = portfolioSitemapImages(items);
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      const p = params(url);
      expect(p.get('w')).toBe('1200');
      expect(p.get('fit')).toBe('max');
      expect(p.get('auto')).toBeNull();
    }
    expect(portfolioSitemapImages([])).toEqual([]);
  });
});

describe('toPortfolioTiles (PORT-120, the embedded block)', () => {
  it('maps every item that has a usable image and skips the rest, so nothing broken renders', () => {
    const tiles = toPortfolioTiles([
      item('image-abc123-1500x1500-jpg', {}, { _id: 'a' }),
      item(null, {}, { _id: 'no-asset' }),
      item('image-abc123-1200x800-jpg', {}, { _id: 'b' }),
      { _id: 'no-image', title: 'Never uploaded', image: null },
    ]);
    expect(tiles.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('an empty list, or a list nothing survives, is an empty array (never a throw, never a null tile)', () => {
    expect(toPortfolioTiles([])).toEqual([]);
    expect(toPortfolioTiles([item(null), { _id: 'x', title: 'x', image: undefined }])).toEqual([]);
  });

  it('uses the host sizes for the grid tile and leaves the lightbox sizes alone', () => {
    const sizes = embeddedTileSizes('blog');
    const [tile] = toPortfolioTiles([item('image-abc123-1500x1500-jpg')], { sizes });
    expect(tile.image.sizes).toBe(sizes);
    expect(tile.image.sizes).not.toBe(TILE_SIZES);
    expect(tile.large.sizes).toBe(lightboxSizesFor({ width: 1500, height: 1500 }));
    // The candidates and the clamp do not change with the host.
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640, 800, 960]);
    const page = toPortfolioTile(item('image-abc123-1500x1500-jpg'))!;
    expect(page.image.srcSet).toBe(tile.image.srcSet);
    expect(page.image.sizes).toBe(TILE_SIZES);
  });

  it('scales the host sizes for a tall image exactly as the page does (one arithmetic, PORT-150)', () => {
    const sizes = embeddedTileSizes('video');
    const [tile] = toPortfolioTiles([item('image-abc123-726x2252-png')], { sizes });
    expect(tile.image.sizes).toBe(scaleSizes(sizes, 0.322));
    expect(tile.image.sizes).toContain('calc(min(33vw, 288px) * 0.322)');
  });
});

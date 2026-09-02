/**
 * PORT-110: the server-side tile mapper, run through the REAL Sanity URL
 * builder (with a placeholder project id, since no env is set under vitest).
 * Asserts three things that matter on the deployed page:
 *   - every rendered URL asks the CDN for a modern format (`auto=format`,
 *     IMG-120) and no SEO URL does (og:image, sitemap);
 *   - no URL ever names more pixels than the asset has, in either fit mode
 *     (the clamp is load-bearing for `fit=crop`, see image-sizes.test.ts);
 *   - a missing or unreadable asset yields no tile rather than a crash.
 */
import { describe, expect, it } from 'vitest';

import type { PortfolioItemCard } from './gallery';
import {
  portfolioRepresentativeImage,
  portfolioSitemapImages,
  toPortfolioTile,
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
  });

  it('falls back to the title for alt and drops a blank description', () => {
    const tile = toPortfolioTile(item('image-abc123-1500x1500-jpg', { alt: '  ' }, { description: ' ' }))!;
    expect(tile.alt).toBe('Embroidered caps for a fire department');
    expect(tile.description).toBeNull();
  });

  it('builds a square hotspot crop with every width clamped to the shorter side', () => {
    const tile = toPortfolioTile(item('image-abc123-1661x947-jpg'))!;
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640, 800]);
    for (const url of urlsOf(tile.image.srcSet)) {
      const p = params(url);
      expect(p.get('fit')).toBe('crop');
      expect(p.get('auto')).toBe('format');
      expect(p.get('w')).toBe(p.get('h'));
      expect(Number(p.get('w'))).toBeLessThanOrEqual(947);
      // The builder emits the crop rectangle the hotspot / centre implies.
      expect(p.get('rect')).toMatch(/^\d+,\d+,\d+,\d+$/);
    }
    expect(tile.image.width).toBe(640);
    expect(tile.image.height).toBe(640);
    expect(params(tile.image.src).get('w')).toBe('640');
    expect(tile.image.sizes).toContain('50vw');
  });

  it('respects a stored crop when clamping', () => {
    const tile = toPortfolioTile(
      item('image-abc123-1661x947-jpg', { crop: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 } }),
    )!;
    // 947 * 0.8 = 757 tall after the crop: 800 no longer fits.
    expect(widthsOf(tile.image.srcSet)).toEqual([320, 480, 640]);
    expect(widthsOf(tile.large.srcSet)).toEqual([800, 1200]);
    expect(tile.large.width).toBe(1200);
    expect(tile.large.height).toBe(684);
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
    expect(tile.image).toMatchObject({ width: 320, height: 320 });
    expect(widthsOf(tile.large.srcSet)).toEqual([390]);
    expect(tile.large).toMatchObject({ width: 390, height: 750 });
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

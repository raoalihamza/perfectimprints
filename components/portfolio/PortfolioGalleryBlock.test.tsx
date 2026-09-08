/**
 * PORT-120: what an embedded Portfolio Gallery block puts in the host page's
 * static HTML. The block is a client component, but its FIRST render is
 * exactly what the server prerenders (no effect has run, nothing has been
 * clicked), so rendering it to static markup is a faithful check of the
 * deployed HTML on every host: every tile is a real <img>, the lightbox is
 * NOT in the markup until a tile is clicked, and an empty block renders
 * NOTHING at all (no heading, no link, no wrapper), the StripCardGrid
 * contract, which is what stops a deleted category or an all-hidden list
 * leaving a stray heading on a product page.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PortfolioTile } from '@/lib/portfolio/tile-data';
import { PortfolioGalleryBlock } from './PortfolioGalleryBlock';

function tile(id: string, extra: Partial<PortfolioTile> = {}): PortfolioTile {
  const img = (w: number) =>
    `https://cdn.sanity.io/images/p/production/${id}-1500x1500.jpg?w=${w}&fit=max&auto=format`;
  const big = (w: number) =>
    `https://cdn.sanity.io/images/p/production/${id}-1500x1500.jpg?w=${w}&fit=max&auto=format`;
  return {
    id,
    title: `Job ${id}`,
    alt: `Photo of job ${id}`,
    description: null,
    clientName: null,
    category: { slug: 'caps-and-hats', title: 'Caps and Hats' },
    colors: ['black'],
    decorationMethods: [],
    industry: null,
    image: {
      src: img(640),
      srcSet: `${img(320)} 320w, ${img(640)} 640w`,
      sizes: '(max-width: 767px) 50vw, min(25vw, 244px)',
      width: 640,
      height: 640,
    },
    large: {
      src: big(1200),
      srcSet: `${big(800)} 800w, ${big(1200)} 1200w`,
      sizes: '100vw',
      width: 1200,
      height: 1200,
    },
    ...extra,
  };
}

const tiles = ['a', 'b', 'c'].map((id) => tile(id));

describe('PortfolioGalleryBlock static markup', () => {
  it('renders nothing at all for an empty list, heading or not', () => {
    expect(renderToStaticMarkup(<PortfolioGalleryBlock tiles={[]} />)).toBe('');
    expect(
      renderToStaticMarkup(<PortfolioGalleryBlock heading="Recent work" tiles={[]} className="my-8" />),
    ).toBe('');
  });

  it('renders every tile as an <img> with srcset and the host sizes, all lazy', () => {
    const html = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} />);
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html.match(/loading="lazy"/g)).toHaveLength(3);
    expect(html).not.toContain('loading="eager"');
    expect(html).toContain('sizes="(max-width: 767px) 50vw, min(25vw, 244px)"');
    expect(html).toContain('alt="Photo of job a"');
    expect(html).toContain('Caps and Hats');
  });

  it('renders the heading only when it has text, and always the link to the full portfolio', () => {
    const withHeading = renderToStaticMarkup(
      <PortfolioGalleryBlock heading="  Recent work  " tiles={tiles} />,
    );
    expect(withHeading).toContain('<h2');
    expect(withHeading).toContain('Recent work');
    expect(withHeading).toContain('aria-label="Recent work"');
    expect(withHeading).toContain('href="/portfolio"');

    const noHeading = renderToStaticMarkup(<PortfolioGalleryBlock heading="   " tiles={tiles} />);
    expect(noHeading).not.toContain('<h2');
    expect(noHeading).toContain('aria-label="Portfolio gallery"');
    expect(noHeading).toContain('href="/portfolio"');
  });

  it('passes the host spacing through and adds none of its own', () => {
    const html = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} className="mt-12 border-t" />);
    expect(html.startsWith('<section class="mt-12 border-t"')).toBe(true);
  });

  // PORT-160: a category-mode block carries its category's shop link, in the
  // host's static HTML, above the "See more" link; a hand-picked block (no
  // shopLink) is byte-for-byte what it was.
  it('renders the shop link when given one, and nothing of it otherwise', () => {
    const link = { categorySlug: 'caps-and-hats', title: 'Caps and Hats', href: '/cat/caps', label: 'Shop all custom caps and hats' };
    const withLink = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} shopLink={link} />);
    expect(withLink).toContain('href="/cat/caps"');
    expect(withLink).toContain('Shop all custom caps and hats');
    expect(withLink.indexOf('/cat/caps')).toBeLessThan(withLink.indexOf('href="/portfolio"'));
    const without = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} />);
    expect(without).not.toContain('/cat/');
    expect(without).not.toContain('Shop all custom');
    expect(without).toBe(renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} shopLink={null} />));
  });

  it('does not contain the lightbox or the full-size image until a tile is clicked', () => {
    const html = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} />);
    expect(html).not.toContain('role="dialog"');
    // PORT-150: tiles are fit=max too; the lightbox is told apart by its own
    // candidate widths (800 / 1200), which no tile srcset carries.
    expect(html).not.toContain('w=800&');
    expect(html).not.toContain('w=1200&');
  });
});

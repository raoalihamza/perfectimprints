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
    `https://cdn.sanity.io/images/p/production/${id}-1500x1500.jpg?w=${w}&h=${w}&fit=crop&auto=format`;
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

  it('does not contain the lightbox or the full-size image until a tile is clicked', () => {
    const html = renderToStaticMarkup(<PortfolioGalleryBlock tiles={tiles} />);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('fit=max');
  });
});

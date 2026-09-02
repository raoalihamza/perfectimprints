/**
 * PORT-110: what the /portfolio page's static HTML actually contains.
 *
 * The browser and grid are client components, but their FIRST render is
 * exactly what the server prerenders (no effect has run, no URL has been
 * read), so rendering them to static markup here is a faithful check of the
 * deployed HTML: every tile is a real <img> with explicit width and height,
 * a srcset and sizes, the first row eager and the rest lazy, the count is
 * present, and the lightbox (and its full-size image) is NOT in the markup
 * until a tile is clicked. The empty grid renders nothing, the StripCardGrid
 * contract.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { DealsFacetSection } from '@/lib/deals-filter';
import { PORTFOLIO_PAGE_SIZE } from '@/lib/portfolio/page-filters';
import type { PortfolioTile } from '@/lib/portfolio/tile-data';
import { PortfolioBrowser } from './PortfolioBrowser';
import { PortfolioGrid } from './PortfolioGrid';
import { PortfolioLightbox } from './PortfolioLightbox';

function tile(id: string, extra: Partial<PortfolioTile> = {}): PortfolioTile {
  const img = (w: number) => `https://cdn.sanity.io/images/p/production/${id}-1500x1500.jpg?w=${w}&h=${w}&fit=crop&auto=format`;
  const big = (w: number) => `https://cdn.sanity.io/images/p/production/${id}-1500x1500.jpg?w=${w}&fit=max&auto=format`;
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
      sizes: '(max-width: 767px) 50vw, 300px',
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

const sections: DealsFacetSection[] = [
  {
    field: 'category',
    label: 'Category',
    type: 'list',
    values: [
      { id: 'caps-and-hats', value: 'caps-and-hats', label: 'Caps and Hats', count: 6, type: 'value', low: null, high: null, skus: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ],
  },
  {
    field: 'colors',
    label: 'Color',
    type: 'list',
    values: [
      { id: 'black', value: 'black', label: 'Black', count: 6, type: 'value', low: null, high: null, skus: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ],
  },
];

const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => tile(id));

describe('PortfolioGrid static markup', () => {
  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(<PortfolioGrid tiles={[]} onOpen={() => {}} />)).toBe('');
  });

  it('renders every tile as an <img> with width, height, srcset and sizes', () => {
    const html = renderToStaticMarkup(<PortfolioGrid tiles={six} onOpen={() => {}} />);
    const imgs = html.match(/<img [^>]+>/g) ?? [];
    expect(imgs).toHaveLength(6);
    for (const img of imgs) {
      expect(img).toContain('width="640"');
      expect(img).toContain('height="640"');
      expect(img).toMatch(/srcset="[^"]+ 320w, [^"]+ 640w"/i);
      expect(img).toContain('sizes="');
      expect(img).toContain('auto=format');
      expect(img).toMatch(/alt="Photo of job [a-f]"/);
    }
  });

  it('loads the first row eagerly and everything after it lazily', () => {
    const html = renderToStaticMarkup(<PortfolioGrid tiles={six} onOpen={() => {}} />);
    const imgs = html.match(/<img [^>]+>/g) ?? [];
    // React 19 serialises the prop as `fetchPriority` (HTML attribute names are case-insensitive).
    expect(imgs.slice(0, 4).every((i) => i.includes('loading="eager"') && /fetchpriority="high"/i.test(i))).toBe(true);
    expect(imgs.slice(4).every((i) => i.includes('loading="lazy"'))).toBe(true);
  });

  it('honours an eager count of zero (later pages)', () => {
    const html = renderToStaticMarkup(<PortfolioGrid tiles={six} onOpen={() => {}} eagerCount={0} />);
    expect(html).not.toContain('loading="eager"');
  });
});

describe('PortfolioBrowser static markup (the server prerender)', () => {
  const html = renderToStaticMarkup(<PortfolioBrowser tiles={six} sections={sections} />);

  it('is the unfiltered view with every tile in the HTML', () => {
    expect(html.match(/<img [^>]+>/g)).toHaveLength(6);
    expect(html).toContain('6 photos');
  });

  it('carries the filter sidebar with both groups and their swatch', () => {
    expect(html).toContain('Caps and Hats');
    expect(html).toContain('Category');
    expect(html).toContain('Color');
    expect(html).toContain('aria-label="Color: Black"');
    // The swatch itself: DealsFilterSidebar renders it only for a `colors` field,
    // so this is what would break if PORTFOLIO_COLOR_FIELD were ever renamed.
    const swatch = html.match(/<span aria-hidden="true" class="[^"]*rounded-full[^"]*" style="background:#111"><\/span>/);
    expect(swatch).not.toBeNull();
    expect(html.match(/style="background:#111"/g)).toHaveLength(1);
  });

  it('does not contain the lightbox or its full-size image until a tile is clicked', () => {
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('fit=max');
  });

  it('shows no pagination control when everything fits on one page', () => {
    expect(html).not.toContain('Portfolio pagination');
  });

  it('shows a labelled pagination control past one page', () => {
    const many = Array.from({ length: PORTFOLIO_PAGE_SIZE + 1 }, (_, i) => tile(`t${i}`));
    const paged = renderToStaticMarkup(<PortfolioBrowser tiles={many} sections={[]} />);
    expect(paged).toContain('aria-label="Portfolio pagination"');
    expect(paged.match(/<img [^>]+>/g)).toHaveLength(PORTFOLIO_PAGE_SIZE);
    expect(paged).toContain(`Showing 1-${PORTFOLIO_PAGE_SIZE} of ${PORTFOLIO_PAGE_SIZE + 1} photos`);
  });
});

describe('PortfolioLightbox markup', () => {
  it('is a labelled modal dialog showing the item, its category and description, with prev/next', () => {
    const tiles = [tile('a'), tile('b', { description: 'Twelve caps, front embroidery.', clientName: 'Any Town FD' }), tile('c')];
    const html = renderToStaticMarkup(
      <PortfolioLightbox tiles={tiles} index={1} onClose={() => {}} onNavigate={() => {}} returnFocusTo={null} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('2 of 3');
    expect(html).toContain('Job b');
    expect(html).toContain('Caps and Hats');
    expect(html).toContain('Twelve caps, front embroidery.');
    expect(html).toContain('Made for Any Town FD');
    expect(html).toContain('aria-label="Previous photo"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain('aria-label="Close"');
    const img = html.match(/<img [^>]+>/g)![0];
    expect(img).toContain('fit=max');
    expect(img).toContain('width="1200"');
    expect(img).toContain('height="1200"');
    expect(img).toContain('sizes="100vw"');
  });

  it('marks previous inert at the start and next inert at the end, without removing them from the tab order', () => {
    const tiles = [tile('a'), tile('b')];
    const first = renderToStaticMarkup(
      <PortfolioLightbox tiles={tiles} index={0} onClose={() => {}} onNavigate={() => {}} returnFocusTo={null} />,
    );
    const prevAtStart = first.match(/<button[^>]*aria-label="Previous photo"[^>]*>/)![0];
    expect(prevAtStart).toContain('aria-disabled="true"');
    expect(prevAtStart).not.toContain(' disabled');
    const nextAtStart = first.match(/<button[^>]*aria-label="Next photo"[^>]*>/)![0];
    expect(nextAtStart).toContain('aria-disabled="false"');
    const last = renderToStaticMarkup(
      <PortfolioLightbox tiles={tiles} index={1} onClose={() => {}} onNavigate={() => {}} returnFocusTo={null} />,
    );
    const nextAtEnd = last.match(/<button[^>]*aria-label="Next photo"[^>]*>/)![0];
    expect(nextAtEnd).toContain('aria-disabled="true"');
    expect(nextAtEnd).not.toContain(' disabled');
  });

  it('renders nothing for an index the filtered set no longer holds', () => {
    expect(
      renderToStaticMarkup(
        <PortfolioLightbox tiles={[tile('a')]} index={5} onClose={() => {}} onNavigate={() => {}} returnFocusTo={null} />,
      ),
    ).toBe('');
  });
});

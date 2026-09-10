// @vitest-environment jsdom
/**
 * FIX-871 write-side test for the landing-page Studio action. The landing
 * generator passes `includeCustom: false`, so today its route never returns a
 * synthetic SKU; this test feeds one anyway, because the action must store
 * whatever the matcher returns in the shape the render side reads, and the
 * flag is a matcher setting that can change without anyone re-reading this
 * action.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  onComplete: vi.fn(),
  authFetch: vi.fn(),
}));

vi.mock('sanity', () => ({
  useDocumentOperation: () => ({ patch: { execute: mocks.execute } }),
}));
vi.mock('../components/useGenerateAuthFetch', () => ({
  useGenerateAuthFetch: () => mocks.authFetch,
}));

// eslint-disable-next-line import/first
import { generateLandingWithAi } from './generate-landing-with-ai';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Description = { onHandle?: () => Promise<void> | void } | null;
let latest: Description = null;

function Harness(props: Parameters<typeof generateLandingWithAi>[0]) {
  latest = generateLandingWithAi(props) as Description;
  return null;
}

const block = { _type: 'block', _key: 'b1', style: 'normal', markDefs: [], children: [] };
const routeResponse = {
  heroHeading: 'Custom Beach Towels in Destin, FL',
  heroSubheading: 'Sub.',
  localIntro: [block],
  optionsIdeas: [block],
  whyUs: [block],
  faqs: [
    { question: 'Minimum?', answer: 'Most start at 25.' },
    { question: 'Lead time?', answer: 'About two weeks.' },
    { question: 'Decoration?', answer: 'Embroidery or print.' },
  ],
  relatedProducts: [{ sku: 'custom-page-abc' }, { sku: '501003' }, { sku: 'custom-drafts.nope' }],
  leadFormHeading: 'Request a Quote in Destin, FL',
  metaTitle: 'Custom Beach Towels Destin',
  metaDescription: 'Beach towels for Destin businesses.',
  suggestedLinks: [],
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.onComplete.mockReset();
  mocks.authFetch.mockReset();
  mocks.authFetch.mockResolvedValue({ ok: true, json: async () => routeResponse });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('generateLandingWithAi (FIX-871)', () => {
  it('stores a synthetic-SKU suggestion as a relatedProductRef reference and a Geiger SKU as a blogProduct entry, dropping an unusable id', async () => {
    const props = {
      id: 'lp1',
      type: 'landingPage',
      draft: {
        _id: 'drafts.lp1',
        _type: 'landingPage',
        title: 'Custom Beach Towels Destin',
        slug: { current: 'custom-beach-towels-destin-fl' },
        city: 'Destin',
        state: 'FL',
        product: 'beach towels',
        landmarks: ['Henderson Beach State Park'],
      },
      published: null,
      onComplete: mocks.onComplete,
    } as unknown as Parameters<typeof generateLandingWithAi>[0];

    await act(async () => {
      root.render(<Harness {...props} />);
    });
    await act(async () => {
      await latest!.onHandle!();
    });

    expect(mocks.authFetch).toHaveBeenCalledWith('/api/sanity/generate-landing', expect.anything());
    const patches = mocks.execute.mock.calls[0][0] as Record<string, Record<string, unknown>>[];
    const set = patches.find((p) => p.set)?.set as { relatedProducts: Record<string, unknown>[] };
    expect(set.relatedProducts.map(({ _key, ...rest }) => rest)).toEqual([
      { _type: 'relatedProductRef', _ref: 'page-abc' },
      { _type: 'blogProduct', sku: '501003' },
    ]);
    for (const p of set.relatedProducts) expect(p._key).toMatch(/^rp-/);
    expect(mocks.onComplete).toHaveBeenCalledTimes(1);
  });
});

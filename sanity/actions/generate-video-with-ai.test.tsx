// @vitest-environment jsdom
/**
 * FIX-871 write-side test for the video Studio action. The action is what
 * turns the route's `relatedProducts` into the stored `video.relatedProducts`
 * array, so it is driven for real (React 19 `act`, the Sanity document
 * operation and the nonce fetch mocked) and the patch it executes is
 * inspected: a Product Page the route returned with a synthetic `custom-<id>`
 * SKU must be stored as the reference entry hand-picking stores.
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
import { generateVideoWithAi } from './generate-video-with-ai';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Description = { onHandle?: () => Promise<void> | void } | null;
let latest: Description = null;

function Harness(props: Parameters<typeof generateVideoWithAi>[0]) {
  latest = generateVideoWithAi(props) as Description;
  return null;
}

const routeResponse = {
  title: 'Custom U Brands Pens for Premium Employee Welcome Kits',
  metaTitle: 'Custom U Brands Pens',
  metaDescription: 'Pens for welcome kits.',
  description: [{ _type: 'block', _key: 'b1', style: 'normal', markDefs: [], children: [] }],
  relatedProducts: [
    { sku: 'custom-327d0759-17bb-49c0-9e0d-342e25de5a29', name: 'U Brands Monterey Earthly Pens' },
    { sku: 'custom-3fadd4c7-2b7c-4a33-91bf-d40fc8b19732', name: 'U Brands Monterey Flagship Pens' },
    { sku: '506872', name: 'Souvenir Jalan Pen' },
    { sku: '', name: 'blank, dropped' },
  ],
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

describe('generateVideoWithAi (FIX-871)', () => {
  it('patches relatedProducts with Product Pages as relatedProductRef references, first, and Geiger SKUs as blogProduct entries', async () => {
    const props = {
      id: 'd0432e2e-e329-4584-b046-1fc82b6fd3c1',
      type: 'video',
      draft: {
        _id: 'drafts.d0432e2e-e329-4584-b046-1fc82b6fd3c1',
        _type: 'video',
        title: 'Custom U Brands Pens',
        slug: { current: 'custom-u-brands-pens-for-premium-employee-welcome-kits' },
        publishDate: '2026-09-01',
        aiScript: 'A script.',
        aiTopicKeywords: ['custom pens'],
      },
      published: null,
      onComplete: mocks.onComplete,
    } as unknown as Parameters<typeof generateVideoWithAi>[0];

    await act(async () => {
      root.render(<Harness {...props} />);
    });
    expect(latest?.onHandle).toBeTypeOf('function');
    await act(async () => {
      await latest!.onHandle!();
    });

    expect(mocks.authFetch).toHaveBeenCalledWith('/api/sanity/generate-video', expect.anything());
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const patches = mocks.execute.mock.calls[0][0] as Record<string, Record<string, unknown>>[];
    const set = patches.find((p) => p.set)?.set as { relatedProducts: Record<string, unknown>[] };
    expect(set.relatedProducts.map(({ _key, ...rest }) => rest)).toEqual([
      { _type: 'relatedProductRef', _ref: '327d0759-17bb-49c0-9e0d-342e25de5a29' },
      { _type: 'relatedProductRef', _ref: '3fadd4c7-2b7c-4a33-91bf-d40fc8b19732' },
      { _type: 'blogProduct', sku: '506872' },
    ]);
    for (const p of set.relatedProducts) expect(p._key).toMatch(/^rp-/);
    expect(JSON.stringify(set.relatedProducts)).not.toContain('"sku":"custom-');
    expect(mocks.onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not touch relatedProducts when the route matched nothing (a curated list is never wiped)', async () => {
    mocks.authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ...routeResponse, relatedProducts: [{ sku: '' }] }),
    });
    const props = {
      id: 'v2',
      type: 'video',
      draft: { _id: 'drafts.v2', _type: 'video', title: 'T', aiScript: 'A script.' },
      published: null,
      onComplete: mocks.onComplete,
    } as unknown as Parameters<typeof generateVideoWithAi>[0];
    await act(async () => {
      root.render(<Harness {...props} />);
    });
    await act(async () => {
      await latest!.onHandle!();
    });
    const patches = mocks.execute.mock.calls[0][0] as Record<string, Record<string, unknown>>[];
    const set = patches.find((p) => p.set)?.set as Record<string, unknown>;
    expect('relatedProducts' in set).toBe(false);
  });
});

// @vitest-environment jsdom
/**
 * AUTO-116: the two blog AI actions driven for real (React 19 `act`, the
 * Sanity document operation and the nonce fetch mocked), and the patch each
 * one executes inspected.
 *
 *   - "Generate Blog with AI" cannot overwrite a field that has anything in
 *     it, for every field it touches, and sends nothing to the AI when
 *     nothing is empty.
 *   - "Regenerate Blog with AI" sends nothing and patches nothing until the
 *     confirmation is accepted.
 *   - A field typed into during the wait is kept.
 *   - While one button runs, both are disabled.
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
import { generateBlogWithAi, regenerateBlogWithAi } from './generate-blog-with-ai';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Dialog = { type?: string; onConfirm?: () => void; onCancel?: () => void } | false | undefined;
type Description = { onHandle?: () => void; disabled?: boolean; dialog?: Dialog } | null;
let fill: Description = null;
let regen: Description = null;

type Props = Parameters<typeof generateBlogWithAi>[0];
function Harness(props: Props) {
  fill = generateBlogWithAi(props) as Description;
  regen = regenerateBlogWithAi(props) as Description;
  return null;
}

const block = (text: string) => ({
  _type: 'block',
  _key: 'b',
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 's', text, marks: [] }],
});

const routeResponse = {
  title: 'AI Title For Water Bottles',
  metaTitle: 'AI meta title',
  metaDescription: 'AI meta description',
  excerpt: 'AI excerpt',
  body: [block('AI body')],
  suggestedLinks: [{ label: 'Water bottles', href: '/cat/water-bottles', reason: 'r' }],
};

const MINE = {
  metaTitle: 'My meta title',
  metaDescription: 'My meta description',
  excerpt: 'My excerpt',
  body: [block('My own paragraph'), { _type: 'image', _key: 'i', asset: { _ref: 'image-x' } }],
} as const;
type ContentField = keyof typeof MINE;
const FIELDS = Object.keys(MINE) as ContentField[];

let root: Root;
let container: HTMLDivElement;

function propsFor(draft: Record<string, unknown>, published: Record<string, unknown> | null = null): Props {
  return {
    id: 'post-1',
    type: 'blogPost',
    draft: { _id: 'drafts.post-1', _type: 'blogPost', ...draft },
    published,
    onComplete: mocks.onComplete,
  } as unknown as Props;
}

async function render(props: Props) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
}

function lastSet(): Record<string, unknown> {
  const calls = mocks.execute.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const patches = calls[calls.length - 1][0] as { set?: Record<string, unknown> }[];
  return patches.find((p) => p.set)?.set ?? {};
}

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

describe('Generate Blog with AI (fills empty fields only)', () => {
  it.each(FIELDS)('cannot overwrite a non-empty %s, and fills the empty ones', async (field) => {
    await render(propsFor({ title: 'Water bottles', slug: { current: 'water-bottles' }, [field]: MINE[field] }));
    await act(async () => {
      fill!.onHandle!();
    });
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
    const set = lastSet();
    expect(field in set).toBe(false);
    expect('title' in set).toBe(false);
    expect('slug' in set).toBe(false);
    expect('publishDate' in set).toBe(false);
    for (const other of FIELDS.filter((f) => f !== field)) expect(set[other]).toEqual(routeResponse[other]);
    // Suggested links describe the generated body, so they go only with it.
    expect('aiSuggestedLinks' in set).toBe(field !== 'body');
  });

  it('sends nothing to the AI and changes nothing when every AI field is filled', async () => {
    await render(propsFor({ title: 'Water bottles', slug: { current: 'water-bottles' }, ...MINE }));
    await act(async () => {
      fill!.onHandle!();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('keeps a field typed into while the AI was writing', async () => {
    let resolve!: (v: unknown) => void;
    mocks.authFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(propsFor({ title: 'Water bottles', slug: { current: 'water-bottles' } }));
    await act(async () => {
      fill!.onHandle!();
    });
    // Patrick types an excerpt during the wait.
    await render(propsFor({ title: 'Water bottles', slug: { current: 'water-bottles' }, excerpt: 'Typed while waiting' }));
    await act(async () => {
      resolve({ ok: true, json: async () => routeResponse });
    });
    const set = lastSet();
    expect('excerpt' in set).toBe(false);
    expect(set.body).toEqual(routeResponse.body);
  });

  it('disables BOTH buttons while it runs', async () => {
    let resolve!: (v: unknown) => void;
    mocks.authFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(propsFor({ title: 'Water bottles' }));
    expect(fill!.disabled).toBe(false);
    expect(regen!.disabled).toBe(false);
    await act(async () => {
      fill!.onHandle!();
    });
    expect(fill!.disabled).toBe(true);
    expect(regen!.disabled).toBe(true);
    await act(async () => {
      resolve({ ok: true, json: async () => routeResponse });
    });
    expect(fill!.disabled).toBe(false);
    expect(regen!.disabled).toBe(false);
  });

  it('a failed generation changes nothing', async () => {
    mocks.authFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Too thin, try again.' }) });
    await render(propsFor({ title: 'Water bottles' }));
    await act(async () => {
      fill!.onHandle!();
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('Regenerate Blog with AI (replaces, after confirmation)', () => {
  const full = { title: 'Water bottles', slug: { current: 'water-bottles' }, ...MINE };

  it('sends nothing and patches nothing until confirmed', async () => {
    await render(propsFor(full));
    await act(async () => {
      regen!.onHandle!();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    const dialog = regen!.dialog as Exclude<Dialog, false | undefined>;
    expect(dialog.type).toBe('confirm');
  });

  it('cancelling leaves the post exactly as it was', async () => {
    await render(propsFor(full));
    await act(async () => {
      regen!.onHandle!();
    });
    await act(async () => {
      (regen!.dialog as { onCancel: () => void }).onCancel();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(regen!.dialog).toBe(false);
  });

  it('after confirming, replaces the fields and moves title and slug together', async () => {
    await render(propsFor(full));
    await act(async () => {
      regen!.onHandle!();
    });
    await act(async () => {
      (regen!.dialog as { onConfirm: () => void }).onConfirm();
    });
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
    const set = lastSet();
    for (const f of FIELDS) expect(set[f]).toEqual(routeResponse[f]);
    expect(set.title).toBe(routeResponse.title);
    expect(set.slug).toEqual({ _type: 'slug', current: 'ai-title-for-water-bottles' });
    expect('publishDate' in set).toBe(false);
  });

  it('on a published post, never touches the title or the slug', async () => {
    await render(propsFor(full, { _id: 'post-1', _type: 'blogPost', ...full }));
    await act(async () => {
      regen!.onHandle!();
    });
    await act(async () => {
      (regen!.dialog as { onConfirm: () => void }).onConfirm();
    });
    const set = lastSet();
    expect('title' in set).toBe(false);
    expect('slug' in set).toBe(false);
    expect(set.body).toEqual(routeResponse.body);
  });
});

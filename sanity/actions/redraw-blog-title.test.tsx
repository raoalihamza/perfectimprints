// @vitest-environment jsdom
/**
 * AUTO-209: the "Redraw title on header image" button driven for real (React
 * 19 `act`, the Sanity document operation and the nonce fetch mocked).
 *
 *   - It exists only when the post has a generated picture whose drawn title
 *     no longer matches the post's title AND the untitled copy is kept.
 *   - It sends source "retitle" with the title, the untitled copy's id, the
 *     stored placement and the slug; never a SKU, never a URL.
 *   - It patches the new picture, keeps the same untitled copy, and hands the
 *     picture with the old title to the guarded removal rule.
 *   - A route refusal is shown and nothing is patched.
 *   - An image changed during the wait is kept; the unused picture is removed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  onComplete: vi.fn(),
  authFetch: vi.fn(),
  afterReplace: vi.fn(),
  unused: vi.fn(),
}));

vi.mock('sanity', () => ({
  useDocumentOperation: () => ({ patch: { execute: mocks.execute } }),
}));
vi.mock('../components/useGenerateAuthFetch', () => ({
  useGenerateAuthFetch: () => mocks.authFetch,
}));
vi.mock('../components/useHeaderAssetDiscard', () => ({
  useHeaderAssetDiscard: () => ({ afterReplace: mocks.afterReplace, unused: mocks.unused }),
}));

// eslint-disable-next-line import/first
import { redrawBlogTitle } from './redraw-blog-title';
// eslint-disable-next-line import/first
import { setBlogActionRunning } from './blog-running';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Dialog = { type?: string; header?: string; onClose?: () => void; content?: unknown } | false | undefined;
type Description = { label?: string; onHandle?: () => void; disabled?: boolean; dialog?: Dialog } | null;
let action: Description = null;

type Props = Parameters<typeof redrawBlogTitle>[0];
function Harness(props: Props) {
  action = redrawBlogTitle(props) as Description;
  return null;
}

const OLD = 'image-old0000000000000000000000000000000000000-1376x768-png';
const UNTITLED = 'image-untitled000000000000000000000000000000000-1376x768-jpg';
const NEW = 'image-new0000000000000000000000000000000000000-1376x768-png';
const newImage = { _type: 'image', asset: { _type: 'reference', _ref: NEW }, alt: 'New Title. The post\'s title over an illustrative photo', titleOnImage: 'New Title', untitledImage: { _type: 'image', asset: { _type: 'reference', _ref: UNTITLED } }, titleTreatment: '{"layout":"panel-left","productBox":null}' };
const routeAnswer = { ok: true, source: 'retitle', outcome: { kind: 'asset', source: 'ai', image: newImage, notes: [] }, summary: 'Header image: the same picture with the current title drawn on it, in the same place.' };

const drifted = {
  title: 'New Title',
  slug: { current: 'new-title' },
  aiTopicKeywords: ['custom pens'],
  headerImage: { _type: 'image', asset: { _type: 'reference', _ref: OLD }, titleOnImage: 'Old Title', untitledImage: { _type: 'image', asset: { _type: 'reference', _ref: UNTITLED } }, titleTreatment: '{"layout":"panel-left","productBox":null}' },
};

let root: Root;
let container: HTMLDivElement;

function propsFor(draft: Record<string, unknown>): Props {
  return { id: 'post-1', type: 'blogPost', draft: { _id: 'drafts.post-1', _type: 'blogPost', ...draft }, published: null, onComplete: mocks.onComplete } as unknown as Props;
}
async function render(props: Props) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
}
function allSets(): Record<string, unknown>[] {
  return mocks.execute.mock.calls.flatMap((call) => (call[0] as { set?: Record<string, unknown> }[]).filter((p) => p.set).map((p) => p.set as Record<string, unknown>));
}

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.onComplete.mockReset();
  mocks.authFetch.mockReset();
  mocks.afterReplace.mockReset();
  mocks.unused.mockReset();
  mocks.authFetch.mockResolvedValue({ ok: true, json: async () => routeAnswer });
  setBlogActionRunning('post-1', false);
  action = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Redraw title on header image', () => {
  it('is absent when the drawn title matches, when there is no drawn title (an upload), and when the untitled copy is gone', async () => {
    await render(propsFor({ ...drifted, title: 'Old Title' }));
    expect(action).toBeNull();
    await render(propsFor({ title: 'New Title', headerImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-uploaded0000000000000000000000000000000000-2000x1125-jpg' } } }));
    expect(action).toBeNull();
    await render(propsFor({ ...drifted, headerImage: { ...drifted.headerImage, untitledImage: undefined } }));
    expect(action).toBeNull();
  });

  it('appears when the title moved; sends source "retitle" with the title, the untitled id, the placement and the slug; patches; removes the old picture', async () => {
    await render(propsFor(drifted));
    expect(action!.label).toBe('Redraw title on header image');
    expect(action!.disabled).toBe(false);
    await act(async () => {
      action!.onHandle!();
    });
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.authFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sanity/generate-blog-image');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ source: 'retitle', title: 'New Title', untitledRef: UNTITLED, treatment: '{"layout":"panel-left","productBox":null}', slug: 'new-title', keywords: ['custom pens'] });
    expect(body.skus).toBeUndefined();
    expect(allSets()).toEqual([{ headerImage: newImage }]);
    expect(mocks.afterReplace).toHaveBeenCalledWith(OLD);
    expect(mocks.afterReplace).not.toHaveBeenCalledWith(UNTITLED);
    expect(mocks.unused).not.toHaveBeenCalled();
    const dialog = action!.dialog as Exclude<Dialog, false | undefined>;
    expect(dialog.header).toBe('Header image updated');
  });

  it('a route refusal is shown and nothing is patched or removed', async () => {
    mocks.authFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'that image is not one the site generated, so no title is drawn on it. Nothing on the post was changed.' }) });
    await render(propsFor(drifted));
    await act(async () => {
      action!.onHandle!();
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.afterReplace).not.toHaveBeenCalled();
    const dialog = action!.dialog as Exclude<Dialog, false | undefined>;
    expect(dialog.header).toBe('The title was not redrawn');
  });

  it('an image changed during the wait is kept, and the picture made for nothing is removed', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mocks.authFetch.mockReturnValue(new Promise((r) => (resolveFetch = r)));
    await render(propsFor(drifted));
    await act(async () => {
      action!.onHandle!();
    });
    // Patrick uploads his own while the title is being drawn.
    await render(propsFor({ ...drifted, headerImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-mine000000000000000000000000000000000000000-1600x900-jpg' } } }));
    await act(async () => {
      resolveFetch({ ok: true, json: async () => routeAnswer });
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.unused).toHaveBeenCalledWith(NEW);
  });

  it('shares the running lock with the other blog buttons', async () => {
    setBlogActionRunning('post-1', true);
    await render(propsFor(drifted));
    expect(action!.disabled).toBe(true);
  });
});

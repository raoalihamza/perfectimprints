// @vitest-environment jsdom
/**
 * AUTO-220: Patrick's own instruction for the header image, the two Studio
 * actions rendered for real under React `act` with the route faked.
 *
 * What these pin: what each button sends; that neither runs without an
 * instruction; that "Change this header picture" is never offered on his own
 * upload or on an older picture; that nothing but an AI picture is ever put on
 * the post; that an image he uploads during the wait is kept; and that the
 * picture a button takes off the post goes to the guarded removal rule with
 * the copy kept beside it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
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
import { changeBlogImageWithInstruction, newBlogImageWithInstruction } from './blog-image-instruction';
// eslint-disable-next-line import/first
import { setBlogActionRunning } from './blog-running';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Dialog = { type?: string; header?: string; onConfirm?: () => void; onCancel?: () => void; onClose?: () => void; content?: unknown; message?: unknown } | false | undefined;
type Description = { label?: string; title?: string; onHandle?: () => void; disabled?: boolean; dialog?: Dialog } | null;
let action: Description = null;
let which: typeof changeBlogImageWithInstruction = changeBlogImageWithInstruction;

type Props = Parameters<typeof changeBlogImageWithInstruction>[0];
function Harness(props: Props) {
  action = which(props) as Description;
  return null;
}

const OURS = 'image-ours-1536x864-png';
const COPY = 'image-copy-1536x864-jpg';
const NEW = 'image-new-1536x864-png';
const NEW_COPY = 'image-newcopy-1536x864-jpg';
const ourPicture = {
  headerImage: { _type: 'image', asset: { _type: 'reference', _ref: OURS }, titleOnImage: 'Custom Tote Bags', ladderRung: 2, editCount: 1, unmarkedImage: { _type: 'image', asset: { _type: 'reference', _ref: COPY } } },
};
const hisUpload = { headerImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-his-1661x947-avif' } } };
/** The state AUTO-212 found: his upload on the post, a generated picture's fields left beside it by Studio. */
const hisUploadOverOurs = { headerImage: { ...ourPicture.headerImage, asset: { _type: 'reference', _ref: 'image-his-1661x947-avif' } } };
const base = {
  _id: 'drafts.post1',
  _type: 'blogPost',
  title: 'Custom Tote Bags',
  slug: { current: 'custom-tote-bags' },
  aiTopicKeywords: ['custom tote bags'],
  relatedCategorySlugs: ['tote-bags'],
  headerImageInstruction: '  Make the background a beach at sunset  ',
  body: [{ _type: 'blogProducts', products: [{ _type: 'blogProduct', sku: '100' }, { _type: 'blogProduct', sku: '200' }] }],
};
const newImage = { _type: 'image', asset: { _type: 'reference', _ref: NEW }, alt: 'alt', titleOnImage: 'Custom Tote Bags', ladderRung: 2, editCount: 2, unmarkedImage: { _type: 'image', asset: { _type: 'reference', _ref: NEW_COPY } } };
const aiAnswer = (mode: string) => ({
  ok: true,
  source: 'ai',
  mode,
  outcome: { kind: 'asset', source: 'ai', image: newImage, notes: [], usage: { capUsed: 7, cap: 40, mode } },
  summary: 'Header image: the picture you had, changed by the AI the way you asked.',
  what: 'the picture you had, changed by the AI the way you asked',
  why: '',
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function render(doc: Record<string, unknown>) {
  const props = { id: 'post1', type: 'blogPost', draft: doc, published: null, onComplete: mocks.onComplete } as unknown as Props;
  await act(async () => {
    root!.render(<Harness {...props} />);
  });
}
const sets = () => mocks.execute.mock.calls.map((c) => (c[0] as { set?: unknown }[])[0]?.set);
const htmlOf = (node: unknown) => renderToStaticMarkup(node as React.ReactElement);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  action = null;
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.authFetch.mockResolvedValue({ ok: true, json: async () => aiAnswer('edit') });
});
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  setBlogActionRunning('post1', false);
});

async function pressAndConfirm() {
  await act(async () => {
    action!.onHandle!();
  });
  await act(async () => {
    (action!.dialog as { onConfirm: () => void }).onConfirm();
  });
}

describe('Change this header picture (your instruction)', () => {
  beforeEach(() => {
    which = changeBlogImageWithInstruction;
  });

  it('asks first, then sends the picture on the post, its copy without the mark, the count and his words, and patches the result', async () => {
    await render({ ...base, ...ourPicture });
    expect(action!.label).toBe('Change this header picture (your instruction)');
    expect(action!.disabled).toBe(false);
    await act(async () => {
      action!.onHandle!();
    });
    // Nothing is sent before he confirms, and the confirmation quotes his own words back.
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(htmlOf((action!.dialog as { message: unknown }).message)).toContain('Make the background a beach at sunset');
    await act(async () => {
      (action!.dialog as { onConfirm: () => void }).onConfirm();
    });
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.authFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sanity/generate-blog-image');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Custom Tote Bags',
      keywords: ['custom tote bags'],
      skus: ['100', '200'],
      rootSlugs: ['tote-bags'],
      slug: 'custom-tote-bags',
      source: 'edit',
      previousRung: 2,
      instruction: 'Make the background a beach at sunset',
      currentRef: OURS,
      unmarkedRef: COPY,
      editCount: 1,
    });
    expect(sets()).toEqual([{ headerImage: newImage }]);
    // The picture it replaced and the copy kept beside it go to the guarded removal rule; nothing was unused.
    expect(mocks.afterReplace.mock.calls).toEqual([[OURS], [COPY]]);
    expect(mocks.unused).not.toHaveBeenCalled();
    expect((action!.dialog as { header?: string }).header).toBe('Header image updated');
    expect(htmlOf((action!.dialog as { content: unknown }).content)).toContain('7 of 40 generated header images used today.');
  });

  it('cancelling sends nothing and changes nothing', async () => {
    await render({ ...base, ...ourPicture });
    await act(async () => {
      action!.onHandle!();
    });
    await act(async () => {
      (action!.dialog as { onCancel: () => void }).onCancel();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("IS NEVER OFFERED ON PATRICK'S OWN PICTURE: an upload, an upload put over a generated picture, an older picture, or no picture", async () => {
    for (const doc of [
      { ...base, ...hisUpload },
      { ...base, ...hisUploadOverOurs },
      { ...base, headerImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-old-1376x768-png' }, titleOnImage: 'T', untitledImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-oldphoto-1376x768-jpg' } } } },
      { ...base },
      { ...base, externalHeaderImage: { url: 'https://imgsirv.geiger.com/x.jpg' } },
    ]) {
      await render(doc);
      expect(action!.disabled, JSON.stringify((doc as { headerImage?: unknown }).headerImage ?? null)).toBe(true);
      expect(action!.title).toMatch(/Make a new picture instead/);
    }
    expect(mocks.authFetch).not.toHaveBeenCalled();
  });

  it('is disabled with no instruction, with no title, after three changes in a row, and while another AI button runs', async () => {
    await render({ ...base, ...ourPicture, headerImageInstruction: '   ' });
    expect(action!.disabled).toBe(true);
    expect(action!.title).toContain('Your instruction for the header image');
    await render({ ...base, ...ourPicture, title: '' });
    expect(action!.disabled).toBe(true);
    await render({ ...base, headerImage: { ...ourPicture.headerImage, editCount: 3 } });
    expect(action!.disabled).toBe(true);
    expect(action!.title).toContain('already been changed 3 times in a row');
    await render({ ...base, ...ourPicture });
    expect(action!.disabled).toBe(false);
    await act(async () => {
      setBlogActionRunning('post1', true);
    });
    expect(action!.disabled).toBe(true);
  });

  it('an image he uploads during the wait is kept; the picture made for nothing and its copy are removed', async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.authFetch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render({ ...base, ...ourPicture });
    await pressAndConfirm();
    // He uploads his own while the AI is working.
    await render({ ...base, ...hisUpload });
    await act(async () => {
      finish({ ok: true, json: async () => aiAnswer('edit') });
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.unused.mock.calls).toEqual([[NEW], [NEW_COPY]]);
    expect(mocks.afterReplace).not.toHaveBeenCalled();
    expect((action!.dialog as { header?: string }).header).toBe('Your image was kept');
  });

  it('a refusal from the server (his own upload, the cap, a guard) is shown in its own words and nothing is changed', async () => {
    mocks.authFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'The picture on this post was uploaded by hand, not made by the site, so it is not changed and stays as it is. Nothing on the post was changed.' }) });
    await render({ ...base, ...ourPicture });
    await pressAndConfirm();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(htmlOf((action!.dialog as { content: unknown }).content)).toContain('uploaded by hand, not made by the site');
  });
});

describe('New header picture (your instruction)', () => {
  beforeEach(() => {
    which = newBlogImageWithInstruction;
    mocks.authFetch.mockResolvedValue({ ok: true, json: async () => aiAnswer('instruction') });
  });

  it('with no image it runs at once and sends his words as an instruction, with no picture ids', async () => {
    await render({ ...base });
    expect(action!.label).toBe('New header picture (your instruction)');
    await act(async () => {
      action!.onHandle!();
    });
    const [, init] = mocks.authFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ source: 'instruction', instruction: 'Make the background a beach at sunset', skus: ['100', '200'] });
    expect(body).not.toHaveProperty('currentRef');
    expect(body).not.toHaveProperty('unmarkedRef');
    expect(sets()).toEqual([{ headerImage: newImage }]);
    expect(mocks.afterReplace).not.toHaveBeenCalled();
  });

  it('on a post that already has an image, his own included, it asks first; only his confirmation replaces it', async () => {
    await render({ ...base, ...hisUpload });
    expect(action!.disabled).toBe(false);
    await act(async () => {
      action!.onHandle!();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect((action!.dialog as { type?: string }).type).toBe('confirm');
    await act(async () => {
      (action!.dialog as { onCancel: () => void }).onCancel();
    });
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('NOTHING BUT AN AI PICTURE IS EVER PUT ON THE POST: a stand-in or no picture leaves it as it was', async () => {
    const standIns = [
      { ok: true, outcome: { kind: 'url', source: 'product', url: 'https://imgsirv.geiger.com/x.jpg', alt: 'x', notes: ['the image model failed: Image request failed (500).'] }, why: 'The image model failed: Image request failed (500).' },
      { ok: true, outcome: { kind: 'asset', source: 'library', image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-lib-1600x900-jpg' } }, notes: [] }, why: '' },
      { ok: true, outcome: { kind: 'none', notes: ['The daily limit of 40 header pictures has been reached, so no picture was made.'] }, why: 'The daily limit of 40 header pictures has been reached, so no picture was made.' },
    ];
    for (const answer of standIns) {
      mocks.execute.mockReset();
      mocks.authFetch.mockResolvedValue({ ok: true, json: async () => answer });
      await render({ ...base, ...hisUpload });
      await pressAndConfirm();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect((action!.dialog as { header?: string }).header).toBe('No picture was made');
    }
    // The cap's refusal reaches him in its own words.
    expect(htmlOf((action!.dialog as { content: unknown }).content)).toContain('The daily limit of 40 header pictures has been reached');
  });

  it('is disabled with no instruction and names the box to type it in', async () => {
    await render({ ...base, headerImageInstruction: undefined });
    expect(action!.disabled).toBe(true);
    expect(action!.title).toContain('Your instruction for the header image');
  });
});

describe('both buttons', () => {
  it('appear on blog posts only', async () => {
    for (const button of [changeBlogImageWithInstruction, newBlogImageWithInstruction]) {
      which = button;
      const props = { id: 'p', type: 'page', draft: { ...base }, published: null, onComplete: mocks.onComplete } as unknown as Props;
      await act(async () => {
        root!.render(<Harness {...props} />);
      });
      expect(action).toBeNull();
    }
  });
});

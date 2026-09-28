// @vitest-environment jsdom
/**
 * AUTO-116: Publish on a blog post stamps an EMPTY publish date with the
 * moment of publishing, then runs the stock Publish; a date that is filled in
 * is never touched. The stock action is stood in for by a fake with the same
 * shape (the real one needs the whole Studio around it).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentActionComponent } from 'sanity';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), originalHandle: vi.fn(), order: [] as string[] }));

vi.mock('sanity', () => ({
  useDocumentOperation: () => ({
    patch: {
      execute: (...args: unknown[]) => {
        mocks.order.push('patch');
        mocks.execute(...args);
      },
    },
  }),
}));

// eslint-disable-next-line import/first
import { withPublishDateStamp } from './stamp-publish-date';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FakePublish: DocumentActionComponent = () => ({
  label: 'Publish',
  onHandle: () => {
    mocks.order.push('publish');
    mocks.originalHandle();
  },
});
FakePublish.action = 'publish';

const Stamped = withPublishDateStamp(FakePublish);
let latest: { label?: string; onHandle?: () => void } | null = null;
function Harness(props: Parameters<DocumentActionComponent>[0]) {
  latest = Stamped(props) as typeof latest;
  return null;
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mocks.execute.mockReset();
  mocks.originalHandle.mockReset();
  mocks.order.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function press(draft: Record<string, unknown> | null) {
  const props = { id: 'p', type: 'blogPost', draft, published: null, onComplete: () => undefined } as unknown as Parameters<
    DocumentActionComponent
  >[0];
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  await act(async () => {
    latest!.onHandle!();
  });
}

describe('withPublishDateStamp', () => {
  it('an empty publish date is set to now, BEFORE the stock Publish runs', async () => {
    const before = Date.now();
    await press({ _id: 'drafts.p', title: 'T' });
    expect(mocks.order).toEqual(['patch', 'publish']);
    const set = (mocks.execute.mock.calls[0][0] as { set: { publishDate: string } }[])[0].set;
    const stamped = Date.parse(set.publishDate);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it('a filled-in publish date is never touched', async () => {
    await press({ _id: 'drafts.p', title: 'T', publishDate: '2019-04-02T10:00:00.000Z' });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(['publish']);
  });

  it('keeps the stock action identity, and hands React the same component every time', () => {
    expect(Stamped.action).toBe('publish');
    expect(withPublishDateStamp(FakePublish)).toBe(Stamped);
  });
});

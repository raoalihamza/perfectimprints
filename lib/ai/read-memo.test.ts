/**
 * AUTO-205 Part 1: one read memo per generation. Inside a scope the same key
 * loads once; outside a scope every call is a plain load (a render path is
 * untouched); a failed load is forgotten; a nested scope joins the open one;
 * and the live drafts read (AUTO-117) never goes through it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inReadMemo, memoizedRead, readMemoSize, withReadMemo } from './read-memo';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('memoizedRead', () => {
  it('outside a scope every call loads: nothing is memoised across requests', async () => {
    let loads = 0;
    const load = async () => ++loads;
    expect(inReadMemo()).toBe(false);
    expect(await memoizedRead('k', load)).toBe(1);
    expect(await memoizedRead('k', load)).toBe(2);
    expect(readMemoSize()).toBe(0);
  });

  it('inside a scope the same key loads once, different keys load each, and the scope ends with the function', async () => {
    let loads = 0;
    const load = async () => ++loads;
    await withReadMemo(async () => {
      expect(inReadMemo()).toBe(true);
      const [a, b, c] = await Promise.all([memoizedRead('k', load), memoizedRead('k', load), memoizedRead('other', load)]);
      expect(a).toBe(b);
      expect(c).not.toBe(a);
      expect(await memoizedRead('k', load)).toBe(a);
      expect(readMemoSize()).toBe(2);
    });
    expect(loads).toBe(2);
    expect(inReadMemo()).toBe(false);
    expect(await memoizedRead('k', load)).toBe(3);
  });

  it('a failed load is not remembered: the next caller retries', async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return 'ok';
    };
    await withReadMemo(async () => {
      await expect(memoizedRead('k', load)).rejects.toThrow('transient');
      expect(await memoizedRead('k', load)).toBe('ok');
      expect(await memoizedRead('k', load)).toBe('ok');
    });
    expect(calls).toBe(2);
  });

  it('a nested withReadMemo joins the scope already open rather than starting a second', async () => {
    let loads = 0;
    const load = async () => ++loads;
    await withReadMemo(async () => {
      await memoizedRead('k', load);
      await withReadMemo(async () => {
        await memoizedRead('k', load);
        expect(readMemoSize()).toBe(1);
      });
    });
    expect(loads).toBe(1);
  });
});

describe('where the memo is and is not', () => {
  it('the generator runs inside one scope, and the reads the strips repeat are memoised by key', () => {
    const gen = read('lib/blog-automation/generate-blog-post.ts');
    expect(gen).toContain('return withReadMemo(() => generateBlogPostInScope(input));');
    expect(read('lib/sanity/queries/effective-category-products.ts')).toContain("memoizedRead('category-control-sets'");
    expect(read('lib/sanity/queries/effective-category-products.ts')).toContain('memoizedRead(`category-override:${slug}`');
    expect(read('lib/ai/related-products.ts')).toContain("memoizedRead('all-custom-products'");
    expect(read('lib/ai/related-products.ts')).toContain("memoizedRead('all-product-page-cards'");
    expect(read('lib/products/site-wide-hidden.ts')).toContain("memoizedRead('hidden-product-context'");
    expect(read('lib/ai/internal-links.ts')).toContain('memoizedRead(`link-docs:${kind}`');
  });

  it('the live drafts read (AUTO-117) and the create path never go through the memo', () => {
    expect(read('lib/blog-automation/written-topics.ts')).not.toContain('read-memo');
    expect(read('lib/blog-automation/create-blog-draft.ts')).not.toContain('memoizedRead');
  });

  it('the memo module is server-only plumbing: node:async_hooks and nothing else', () => {
    const src = read('lib/ai/read-memo.ts');
    expect(src.match(/^import .* from '[^']+';$/gm)).toEqual(["import { AsyncLocalStorage } from 'node:async_hooks';"]);
  });
});

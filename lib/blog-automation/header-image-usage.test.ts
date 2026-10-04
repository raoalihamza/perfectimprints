/**
 * AUTO-202: the generated header image cap is its own counter document, the
 * portfolio's mechanism, reserved before spending.
 */
import { describe, expect, it } from 'vitest';
import {
  BLOG_IMAGE_AI_DAILY_CAP,
  BLOG_IMAGE_AI_USAGE_DOC_ID,
  BLOG_IMAGE_AI_USAGE_DOC_TYPE,
  blogImageCapMessage,
  reserveBlogImageCall,
  type BlogImageUsageClient,
} from './header-image-usage';
import { PORTFOLIO_AI_USAGE_DOC_ID, reservePortfolioAiCall } from '../portfolio/ai-usage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface StoredDoc {
  _id: string;
  _type: string;
  _rev: string;
  day?: string;
  count?: number;
}

function fakeClient() {
  const docs = new Map<string, StoredDoc>();
  let rev = 0;
  const client: BlogImageUsageClient = {
    async fetch<T>(_q: string, params?: Record<string, unknown>) {
      const d = docs.get(String(params?.id));
      return (d ? { _rev: d._rev, day: d.day, count: d.count } : null) as T;
    },
    async createIfNotExists(d) {
      if (!docs.has(d._id)) docs.set(d._id, { ...(d as unknown as StoredDoc), _rev: `r${++rev}` });
    },
    patch(id) {
      return {
        ifRevisionId(r) {
          return {
            set(attrs) {
              return {
                async commit() {
                  const d = docs.get(id);
                  if (!d || d._rev !== r) throw new Error('conflict');
                  docs.set(id, { ...d, ...attrs, _rev: `r${++rev}` } as StoredDoc);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, docs };
}

const NOON = new Date('2026-10-05T12:00:00Z');

describe('reserveBlogImageCall', () => {
  it('counts in its own document, separate from the portfolio counter', async () => {
    expect(BLOG_IMAGE_AI_USAGE_DOC_ID).not.toBe(PORTFOLIO_AI_USAGE_DOC_ID);
    const f = fakeClient();
    await reservePortfolioAiCall(f.client, NOON);
    const r = await reserveBlogImageCall(f.client, NOON);
    expect(r).toEqual({ ok: true, used: 1, cap: BLOG_IMAGE_AI_DAILY_CAP, day: '2026-10-05' });
    expect(f.docs.get(BLOG_IMAGE_AI_USAGE_DOC_ID)).toMatchObject({ _type: BLOG_IMAGE_AI_USAGE_DOC_TYPE, count: 1 });
    expect(f.docs.get(PORTFOLIO_AI_USAGE_DOC_ID)).toMatchObject({ count: 1 });
  });

  it('refuses the twenty-first picture of the day in plain words, and starts over the next day', async () => {
    const f = fakeClient();
    for (let i = 0; i < BLOG_IMAGE_AI_DAILY_CAP; i += 1) expect((await reserveBlogImageCall(f.client, NOON)).ok).toBe(true);
    const refused = await reserveBlogImageCall(f.client, NOON);
    expect(refused).toMatchObject({ ok: false, reason: 'cap', used: 20, cap: 20 });
    if (refused.ok === false) {
      expect(refused.message).toBe(blogImageCapMessage(20));
      expect(refused.message).toContain('midnight UTC');
      expect(refused.message).toContain('upload your own header image');
    }
    expect((await reserveBlogImageCall(f.client, new Date('2026-10-06T00:00:01Z'))).ok).toBe(true);
  });

  it('the cap is 20 and the counter type is not a registered schema type', () => {
    expect(BLOG_IMAGE_AI_DAILY_CAP).toBe(20);
    const index = readFileSync(join(__dirname, '..', '..', 'sanity', 'schemas', 'index.ts'), 'utf8');
    expect(index).not.toContain(BLOG_IMAGE_AI_USAGE_DOC_TYPE);
  });

  it('the shared cap mechanism is pure: no imports, no fs, no Sanity, no React, no server-only', () => {
    const raw = readFileSync(join(__dirname, '..', 'ai', 'daily-usage-cap.ts'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src.match(/^import /gm) ?? []).toEqual([]);
    expect(src).not.toMatch(/server-only|node:|@sanity|next\/|from 'react'/);
    // This module and the portfolio one each import only that mechanism.
    expect(readFileSync(join(__dirname, 'header-image-usage.ts'), 'utf8').match(/from '([^']+)'/g)).toEqual(["from '../ai/daily-usage-cap'"]);
  });
});

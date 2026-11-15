/**
 * AUTO-220: the daily cap on pictures drawn by the main image model is its
 * own counter document, the same mechanism as the backup model's, reserved
 * before anything is spent, and fails closed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_IMAGE_OPENAI_DAILY_CAP, BLOG_IMAGE_OPENAI_USAGE_DOC_ID, BLOG_IMAGE_OPENAI_USAGE_DOC_TYPE, openAiImageCapMessage, reserveOpenAiImageCall } from './openai-image-usage';
import { BLOG_IMAGE_AI_DAILY_CAP, BLOG_IMAGE_AI_USAGE_DOC_ID, reserveBlogImageCall } from './header-image-usage';
import type { DailyCapClient } from '../ai/daily-usage-cap';

interface StoredDoc {
  _id: string;
  _type: string;
  _rev: string;
  day?: string;
  count?: number;
}

function fakeClient(opts: { failWrites?: boolean } = {}) {
  const docs = new Map<string, StoredDoc>();
  let rev = 0;
  const client: DailyCapClient = {
    async fetch<T>(_q: string, params?: Record<string, unknown>) {
      const d = docs.get(String(params?.id));
      return (d ? { _rev: d._rev, day: d.day, count: d.count } : null) as T;
    },
    async createIfNotExists(d) {
      if (opts.failWrites) throw new Error('Sanity is unreachable');
      if (!docs.has(d._id)) docs.set(d._id, { ...(d as unknown as StoredDoc), _rev: `r${++rev}` });
    },
    patch(id) {
      return {
        ifRevisionId(r) {
          return {
            set(attrs) {
              return {
                async commit() {
                  if (opts.failWrites) throw new Error('Sanity is unreachable');
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

const NOON = new Date('2026-11-14T12:00:00Z');

describe('the cap on the main image model', () => {
  it('is 40 a day, counted in its own unregistered document', () => {
    expect(BLOG_IMAGE_OPENAI_DAILY_CAP).toBe(40);
    expect(BLOG_IMAGE_OPENAI_USAGE_DOC_ID).toBe('blogImageOpenAiUsage');
    expect(BLOG_IMAGE_OPENAI_USAGE_DOC_TYPE).toBe('blogImageOpenAiUsage');
    expect(readFileSync(join(process.cwd(), 'sanity/schemas/index.ts'), 'utf8')).not.toContain('blogImageOpenAiUsage');
  });

  it('counts every reservation, refuses the one past the cap in plain words, and starts again the next UTC day', async () => {
    const { client, docs } = fakeClient();
    for (let i = 1; i <= 3; i += 1) {
      expect(await reserveOpenAiImageCall(client, NOON, 3)).toMatchObject({ ok: true, used: i, cap: 3, day: '2026-11-14' });
    }
    const refused = await reserveOpenAiImageCall(client, NOON, 3);
    expect(refused.ok).toBe(false);
    if (refused.ok === false) {
      expect(refused.reason).toBe('cap');
      expect(refused.message).toBe(openAiImageCapMessage(3));
      expect(refused.message).toContain('The daily limit of 3 header pictures has been reached, so no picture was made.');
      expect(refused.message).toContain('resets at midnight UTC');
      expect(refused.message).toContain('upload your own');
    }
    expect(docs.get(BLOG_IMAGE_OPENAI_USAGE_DOC_ID)?.count).toBe(3);
    expect(await reserveOpenAiImageCall(client, new Date('2026-11-15T00:00:01Z'), 3)).toMatchObject({ ok: true, used: 1, day: '2026-11-15' });
  });

  it('fails CLOSED: a counter that cannot be written means no picture', async () => {
    const { client } = fakeClient({ failWrites: true });
    const out = await reserveOpenAiImageCall(client, NOON);
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe('unavailable');
  });

  it('is SEPARATE from the backup model\'s counter: spending one leaves the other whole', async () => {
    const { client, docs } = fakeClient();
    for (let i = 0; i < 5; i += 1) await reserveOpenAiImageCall(client, NOON);
    expect(await reserveBlogImageCall(client, NOON)).toMatchObject({ ok: true, used: 1, cap: BLOG_IMAGE_AI_DAILY_CAP });
    expect(docs.get(BLOG_IMAGE_OPENAI_USAGE_DOC_ID)?.count).toBe(5);
    expect(docs.get(BLOG_IMAGE_AI_USAGE_DOC_ID)?.count).toBe(1);
    expect(BLOG_IMAGE_OPENAI_USAGE_DOC_ID).not.toBe(BLOG_IMAGE_AI_USAGE_DOC_ID);
  });

  it('the morning digest reports the main model\'s counter', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/cron/blog-digest/route.ts'), 'utf8');
    expect(route).toContain("from '@/lib/blog-automation/openai-image-usage'");
    expect(route).toContain('{ id: BLOG_IMAGE_OPENAI_USAGE_DOC_ID }');
    expect(route).toContain('cap: BLOG_IMAGE_OPENAI_DAILY_CAP');
  });
});

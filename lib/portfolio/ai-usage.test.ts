/**
 * PORT-170: the daily cap counter against a fake Sanity client that behaves
 * like the real one (revision-guarded writes, conflicts, outages).
 */
import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_AI_DAILY_CAP,
  PORTFOLIO_AI_USAGE_DOC_ID,
  PORTFOLIO_AI_USAGE_DOC_TYPE,
  capReachedMessage,
  reservePortfolioAiCall,
  usageDayKey,
  type PortfolioAiUsageClient,
} from './ai-usage';

interface StoredDoc {
  _id: string;
  _type: string;
  _rev: string;
  day?: string;
  count?: number;
}

/** In-memory stand-in for the counter document with real compare-and-set semantics. */
function fakeClient(opts: { initial?: Partial<StoredDoc>; failWrites?: number; down?: boolean } = {}) {
  let doc: StoredDoc | null = opts.initial
    ? { _id: PORTFOLIO_AI_USAGE_DOC_ID, _type: PORTFOLIO_AI_USAGE_DOC_TYPE, _rev: 'r0', ...opts.initial }
    : null;
  let revCounter = 0;
  let writesToFail = opts.failWrites ?? 0;
  const log: string[] = [];
  const client: PortfolioAiUsageClient = {
    async fetch<T>() {
      if (opts.down) throw new Error('down');
      log.push('fetch');
      return (doc ? { _rev: doc._rev, day: doc.day, count: doc.count } : null) as T;
    },
    async createIfNotExists(d) {
      if (opts.down) throw new Error('down');
      log.push('createIfNotExists');
      if (!doc) doc = { ...(d as unknown as StoredDoc), _rev: `r${++revCounter}` };
    },
    patch(id) {
      return {
        ifRevisionId(rev) {
          return {
            set(attrs) {
              return {
                async commit() {
                  log.push(`commit@${rev}`);
                  if (writesToFail > 0) {
                    writesToFail -= 1;
                    // Simulate a concurrent winner: the stored revision moved on.
                    if (doc) doc = { ...doc, _rev: `r${++revCounter}`, count: (doc.count ?? 0) + 1 };
                    throw new Error('conflict');
                  }
                  if (!doc || doc._id !== id || doc._rev !== rev) throw new Error('conflict');
                  doc = { ...doc, ...attrs, _rev: `r${++revCounter}` } as StoredDoc;
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, log, get doc() { return doc; } };
}

const NOON = new Date('2026-09-08T12:00:00Z');

describe('reservePortfolioAiCall', () => {
  it('seeds the counter on first use and reserves slot 1 for today', async () => {
    const f = fakeClient();
    const r = await reservePortfolioAiCall(f.client, NOON);
    expect(r).toEqual({ ok: true, used: 1, cap: PORTFOLIO_AI_DAILY_CAP, day: '2026-09-08' });
    expect(f.doc?.count).toBe(1);
    expect(f.doc?.day).toBe('2026-09-08');
    expect(f.doc?._type).toBe(PORTFOLIO_AI_USAGE_DOC_TYPE);
  });

  it('counts up on the same day and refuses at the cap without writing', async () => {
    const f = fakeClient({ initial: { day: '2026-09-08', count: PORTFOLIO_AI_DAILY_CAP - 1 } });
    const last = await reservePortfolioAiCall(f.client, NOON);
    expect(last.ok).toBe(true);
    if (last.ok) expect(last.used).toBe(PORTFOLIO_AI_DAILY_CAP);
    const refused = await reservePortfolioAiCall(f.client, NOON);
    expect(refused.ok).toBe(false);
    if (refused.ok === false) {
      expect(refused.reason).toBe('cap');
      expect(refused.used).toBe(PORTFOLIO_AI_DAILY_CAP);
      expect(refused.message).toBe(capReachedMessage(PORTFOLIO_AI_DAILY_CAP));
    }
    expect(f.doc?.count).toBe(PORTFOLIO_AI_DAILY_CAP);
    expect(f.log.filter((l) => l.startsWith('commit')).length).toBe(1);
  });

  it('a new UTC day starts the count over', async () => {
    const f = fakeClient({ initial: { day: '2026-09-07', count: PORTFOLIO_AI_DAILY_CAP } });
    const r = await reservePortfolioAiCall(f.client, NOON);
    expect(r).toMatchObject({ ok: true, used: 1, day: '2026-09-08' });
    expect(f.doc?.day).toBe('2026-09-08');
  });

  it('retries after a revision conflict and never double-counts', async () => {
    const f = fakeClient({ initial: { day: '2026-09-08', count: 3 }, failWrites: 2 });
    const r = await reservePortfolioAiCall(f.client, NOON);
    // Two concurrent winners took 4 and 5; this call gets 6.
    expect(r).toMatchObject({ ok: true, used: 6 });
    expect(f.doc?.count).toBe(6);
  });

  it('fails CLOSED when the counter cannot be written', async () => {
    const f = fakeClient({ initial: { day: '2026-09-08', count: 0 }, failWrites: 99 });
    const r = await reservePortfolioAiCall(f.client, NOON);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe('unavailable');
  }, 15_000);

  it('fails CLOSED when Sanity is unreachable', async () => {
    const f = fakeClient({ down: true });
    const r = await reservePortfolioAiCall(f.client, NOON);
    expect(r).toMatchObject({ ok: false, reason: 'unavailable', used: 0 });
  });

  it('honours a custom cap and treats a corrupt count as zero', async () => {
    const f = fakeClient({ initial: { day: '2026-09-08', count: Number.NaN } });
    const r = await reservePortfolioAiCall(f.client, NOON, 2);
    expect(r).toMatchObject({ ok: true, used: 1, cap: 2 });
  });

  it('the cap is generous for a photo session and a real ceiling: 100 per UTC day', () => {
    expect(PORTFOLIO_AI_DAILY_CAP).toBe(100);
    expect(usageDayKey(new Date('2026-09-08T23:59:59Z'))).toBe('2026-09-08');
    expect(usageDayKey(new Date('2026-09-09T00:00:00Z'))).toBe('2026-09-09');
    expect(capReachedMessage(100)).toMatch(/nothing was sent to Google/);
    expect(capReachedMessage(100)).toMatch(/by hand/);
  });
});

/**
 * AUTO-208 Part 2: the slot claim. A fake Sanity client with REAL conflict
 * semantics (a create of an existing id fails; ifRevisionId fails when the
 * revision moved), so two simultaneous runs are proven unable to both own a
 * slot, and the stale and failed takeovers are proven to hand the slot to
 * exactly one caller.
 */
import { describe, expect, it } from 'vitest';
import { claimRunSlot, countFinishedRuns, runDayKey, runLogId, RUN_LOG_TYPE, RUN_STALE_MS, updateRun, type RunLogClient, type RunLogDocument } from './run-log';

type Stored = RunLogDocument & { _rev: string };

/** A dataset in memory: `create` refuses an existing id, `ifRevisionId` refuses a moved revision, every write bumps `_rev`. */
function fakeDataset(opts: { delayMs?: number } = {}) {
  const docs = new Map<string, Stored>();
  let revCounter = 0;
  const nextRev = () => `r${(revCounter += 1)}`;
  const tick = () => new Promise<void>((r) => setTimeout(r, opts.delayMs ?? 0));
  const client: RunLogClient = {
    async create(doc) {
      await tick();
      if (docs.has(doc._id)) throw new Error(`Document by ID "${doc._id}" already exists`);
      docs.set(doc._id, { ...doc, _rev: nextRev() });
      return docs.get(doc._id);
    },
    async fetch<T>(query: string, params: Record<string, unknown> = {}): Promise<T> {
      await tick();
      if (query.startsWith('*[_id == $id][0]')) {
        const d = docs.get(String(params.id));
        return (d ? { _rev: d._rev, status: d.status, attempts: d.attempts, updatedAt: d.updatedAt, claimedAt: d.claimedAt } : null) as T;
      }
      if (query.startsWith('count(')) {
        return [...docs.values()].filter((d) => d._type === params.type && d.day === params.day && (d.status === 'written' || d.status === 'published')).length as T;
      }
      throw new Error(`fake: unknown query ${query}`);
    },
    patch(id) {
      const apply = (attrs: Record<string, unknown>, rev?: string) => ({
        async commit() {
          await tick();
          const d = docs.get(id);
          if (!d) throw new Error('not found');
          if (rev !== undefined && d._rev !== rev) throw new Error('revision mismatch');
          docs.set(id, { ...d, ...(attrs as Partial<Stored>), _rev: nextRev() });
          return docs.get(id);
        },
      });
      return {
        set: (attrs) => apply(attrs),
        ifRevisionId: (rev) => ({ set: (attrs) => apply(attrs, rev) }),
      };
    },
  };
  return { client, docs };
}

const T0 = new Date('2026-10-17T02:00:05.000Z');
const DAY = runDayKey(T0);
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('the claim', () => {
  it('names the document by UTC day and slot', () => {
    expect(runLogId('2026-10-17', 'a')).toBe('blogAutomationRun.2026-10-17.a');
    expect(runDayKey(new Date('2026-10-17T23:59:59.999Z'))).toBe('2026-10-17');
    expect(runDayKey(new Date('2026-10-18T00:00:00.000Z'))).toBe('2026-10-18');
  });

  it('the first firing creates the document and owns the slot', async () => {
    const { client, docs } = fakeDataset();
    const r = await claimRunSlot(client, { day: DAY, slot: 'a', now: T0, switches: { paused: false, publishMode: 'draft' } });
    expect(r).toEqual({ ok: true, id: runLogId(DAY, 'a'), attempt: 1, takenOverFrom: null });
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d._type).toBe(RUN_LOG_TYPE);
    expect(d.status).toBe('claimed');
    expect(d.attempts).toBe(1);
    expect(d.switches).toEqual({ paused: false, publishMode: 'draft' });
  });

  it('TWO SIMULTANEOUS FIRINGS CANNOT BOTH OWN THE SLOT: exactly one wins, the other declines as in progress', async () => {
    const { client } = fakeDataset({ delayMs: 2 });
    const [a, b] = await Promise.all([
      claimRunSlot(client, { day: DAY, slot: 'a', now: T0 }),
      claimRunSlot(client, { day: DAY, slot: 'a', now: T0 }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ ok: false, reason: 'in-progress', existingStatus: 'claimed' });
  });

  it('a second firing into a FINISHED slot declines as done', async () => {
    const { client } = fakeDataset();
    const first = await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 });
    expect(first.ok).toBe(true);
    await updateRun(client, runLogId(DAY, 'a'), { now: later(90), status: 'written', stage: 'record', finishedAt: later(90).toISOString() });
    const second = await claimRunSlot(client, { day: DAY, slot: 'a', now: later(1800) });
    expect(second).toMatchObject({ ok: false, reason: 'done', existingStatus: 'written' });
    expect(await countFinishedRuns(client, DAY)).toBe(1);
  });

  it('a live claim (touched within the stale window) is left alone', async () => {
    const { client } = fakeDataset();
    await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 });
    await updateRun(client, runLogId(DAY, 'a'), { now: later(240), status: 'running', stage: 'generate' });
    const second = await claimRunSlot(client, { day: DAY, slot: 'a', now: later(240 + RUN_STALE_MS / 1000 - 1) });
    expect(second).toMatchObject({ ok: false, reason: 'in-progress', existingStatus: 'running' });
  });

  it('a STALE claim (older than RUN_STALE_MS) is taken over: the retry owns the slot with attempts + 1', async () => {
    const { client, docs } = fakeDataset();
    await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 });
    await updateRun(client, runLogId(DAY, 'a'), { now: later(60), status: 'running', stage: 'generate' });
    const retry = await claimRunSlot(client, { day: DAY, slot: 'a', now: later(60 + RUN_STALE_MS / 1000) });
    expect(retry).toEqual({ ok: true, id: runLogId(DAY, 'a'), attempt: 2, takenOverFrom: 'running' });
    const d = docs.get(runLogId(DAY, 'a'))!;
    expect(d.status).toBe('claimed');
    expect(d.attempts).toBe(2);
    expect(d.takenOverFrom).toBe('running');
  });

  it('a FAILED slot is taken over at once, whatever its age', async () => {
    const { client } = fakeDataset();
    await claimRunSlot(client, { day: DAY, slot: 'b', now: T0 });
    await updateRun(client, runLogId(DAY, 'b'), { now: later(100), status: 'failed', stage: 'generate', error: { stage: 'generate', message: 'DeepSeek did not answer' } });
    const retry = await claimRunSlot(client, { day: DAY, slot: 'b', now: later(101) });
    expect(retry).toMatchObject({ ok: true, attempt: 2, takenOverFrom: 'failed' });
  });

  it('two firings that both find a stale claim: exactly one takeover wins, the other loses the race', async () => {
    const { client } = fakeDataset({ delayMs: 2 });
    await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 });
    const at = later(RUN_STALE_MS / 1000 + 5);
    const [a, b] = await Promise.all([
      claimRunSlot(client, { day: DAY, slot: 'a', now: at }),
      claimRunSlot(client, { day: DAY, slot: 'a', now: at }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].filter((r) => r.ok === false && r.reason === 'lost-race')).toHaveLength(1);
  });

  it('different slots and different days never collide', async () => {
    const { client } = fakeDataset();
    expect((await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 })).ok).toBe(true);
    expect((await claimRunSlot(client, { day: DAY, slot: 'b', now: T0 })).ok).toBe(true);
    expect((await claimRunSlot(client, { day: '2026-10-18', slot: 'a', now: T0 })).ok).toBe(true);
  });

  it('a run log that cannot be read answers unavailable, never a claim', async () => {
    const client: RunLogClient = {
      create: async () => {
        throw new Error('exists');
      },
      fetch: async () => {
        throw new Error('socket hang up');
      },
      patch: () => {
        throw new Error('unused');
      },
    };
    const r = await claimRunSlot(client, { day: DAY, slot: 'a', now: T0 });
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('updateRun never throws and reports the failure', async () => {
    const client: RunLogClient = {
      create: async () => undefined,
      fetch: async () => null as never,
      patch: () => ({
        set: () => ({
          commit: async () => {
            throw new Error('down');
          },
        }),
        ifRevisionId: () => ({ set: () => ({ commit: async () => undefined }) }),
      }),
    };
    await expect(updateRun(client, 'x', { now: T0, status: 'running' })).resolves.toBe(false);
  });
});

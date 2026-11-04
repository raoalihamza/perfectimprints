/**
 * SEC-100: the live read-health check (lib/sanity/read-health.ts), used by
 * the morning digest and GET /api/health/sanity. It must never throw and must
 * name each failure in words Ali can act on.
 */
import { describe, expect, it, vi } from 'vitest';
import { SanityReadTokenMissingError } from './read-access';
import { checkSanityReadHealth, type ReadHealthDeps } from './read-health';

vi.mock('server-only', () => ({}));

const deps = (over: Partial<ReadHealthDeps>): ReadHealthDeps => ({
  projectId: 'testproj',
  readSingletonId: async () => 'globalSettings',
  countAnonymously: async () => 0,
  ...over,
});

describe('the read health check', () => {
  it('ok only when the token reads AND the dataset refuses anonymous reads', async () => {
    const h = await checkSanityReadHealth(deps({}));
    expect(h).toMatchObject({ ok: true, readToken: 'ok', dataset: 'private' });
    expect(h.message).toContain('not publicly readable');
  });

  it('a still-public dataset is not ok, and says so', async () => {
    const h = await checkSanityReadHealth(deps({ countAnonymously: async () => 4295 }));
    expect(h).toMatchObject({ ok: false, readToken: 'ok', dataset: 'public' });
    expect(h.message).toContain('still PUBLIC');
  });

  it('a missing token, a rejected token, a token with no read access, and an outage each get their own words', async () => {
    const missing = await checkSanityReadHealth(deps({ readSingletonId: () => Promise.reject(new SanityReadTokenMissingError()) }));
    expect(missing).toMatchObject({ ok: false, readToken: 'missing' });
    expect(missing.message).toContain('is NOT set');

    const rejected = await checkSanityReadHealth(deps({ readSingletonId: () => Promise.reject(Object.assign(new Error('Unauthorized'), { statusCode: 401 })) }));
    expect(rejected.readToken === 'rejected' || rejected.readToken === 'missing').toBe(true);
    expect(rejected.ok).toBe(false);

    const cannot = await checkSanityReadHealth(deps({ readSingletonId: async () => null }));
    expect(cannot).toMatchObject({ ok: false, readToken: 'cannot-read' });
    expect(cannot.message).toContain('Viewer');

    const outage = await checkSanityReadHealth(deps({ readSingletonId: () => Promise.reject(new Error('ETIMEDOUT')) }));
    expect(outage).toMatchObject({ ok: false, readToken: 'error' });
  });

  it('never throws, even when both questions fail', async () => {
    const h = await checkSanityReadHealth(
      deps({ readSingletonId: () => Promise.reject(new Error('a')), countAnonymously: () => Promise.reject(new Error('b')) }),
    );
    expect(h).toMatchObject({ ok: false, readToken: 'error', dataset: 'unknown' });
  });

  it('a server with no configured project says so instead of guessing', async () => {
    const h = await checkSanityReadHealth(deps({ projectId: 'placeholder' }));
    expect(h).toMatchObject({ ok: false, dataset: 'unknown' });
  });
});

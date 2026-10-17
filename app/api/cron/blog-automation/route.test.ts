/**
 * AUTO-208: the writing route itself refuses a staging-host firing and an
 * unauthorised one BEFORE touching the scheduler, and hands a production
 * firing to the scheduler with the slot the schedule header names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NON_PRODUCTION_HOSTS, PRODUCTION_HOST } from '@/lib/seo/indexing-policy';

const run = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@/lib/blog-automation/scheduler', () => ({
  runScheduledPost: vi.fn(async (slot: string) => {
    run.calls.push(slot);
    return { kind: 'written', day: '2026-10-17', slot, runId: `blogAutomationRun.2026-10-17.${slot}` };
  }),
}));
vi.mock('@/lib/blog-automation/scheduler-deps', () => ({ defaultSchedulerDeps: vi.fn(async () => ({})) }));

const SECRET = 'a-long-random-secret-of-at-least-sixteen';
const env = { ...process.env };

async function fire(opts: { siteUrl?: string; secret?: string; header?: string | null; schedule?: string; slot?: string }) {
  if (opts.siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = opts.siteUrl;
  if (opts.secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = opts.secret;
  const { GET } = await import('./route');
  const headers = new Headers();
  if (opts.header) headers.set('authorization', opts.header);
  if (opts.schedule) headers.set('x-vercel-cron-schedule', opts.schedule);
  const url = `https://any.example/api/cron/blog-automation${opts.slot ? `?slot=${opts.slot}` : ''}`;
  const res = await GET(new Request(url, { headers }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  run.calls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe('GET /api/cron/blog-automation', () => {
  it('a STAGING-host firing with the right secret is refused with 403 and the scheduler is never called', async () => {
    const r = await fire({ siteUrl: `https://${NON_PRODUCTION_HOSTS[0]}`, secret: SECRET, header: `Bearer ${SECRET}` });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('not-production-host');
    expect(run.calls).toEqual([]);
  });

  it('an UNAUTHORISED firing on production is refused with 401 and the scheduler is never called', async () => {
    const wrong = await fire({ siteUrl: `https://${PRODUCTION_HOST}`, secret: SECRET, header: 'Bearer nope' });
    expect(wrong.status).toBe(401);
    const none = await fire({ siteUrl: `https://${PRODUCTION_HOST}`, secret: SECRET, header: null });
    expect(none.status).toBe(401);
    expect(run.calls).toEqual([]);
  });

  it('production with CRON_SECRET unset is a 503 naming the variable', async () => {
    const r = await fire({ siteUrl: `https://${PRODUCTION_HOST}`, header: `Bearer ${SECRET}` });
    expect(r.status).toBe(503);
    expect(String(r.body.error)).toContain('CRON_SECRET');
    expect(run.calls).toEqual([]);
  });

  it('a production firing with the secret runs the scheduler for the slot the schedule header names', async () => {
    const r = await fire({ siteUrl: `https://${PRODUCTION_HOST}`, secret: SECRET, header: `Bearer ${SECRET}`, schedule: '30 8 * * *' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, kind: 'written', slot: 'b' });
    expect(run.calls).toEqual(['b']);
  });

  it('a hand-fired run with the secret may name its slot', async () => {
    const r = await fire({ siteUrl: `https://${PRODUCTION_HOST}`, secret: SECRET, header: `Bearer ${SECRET}`, slot: 'proof-1' });
    expect(r.status).toBe(200);
    expect(run.calls).toEqual(['proof-1']);
  });
});

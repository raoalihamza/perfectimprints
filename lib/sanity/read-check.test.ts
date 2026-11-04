/**
 * SEC-100 guard 1: the prebuild check's rules (lib/sanity/read-check.ts).
 * A failed check fails `pnpm build`, so Vercel keeps the previous deployment.
 */
import { describe, expect, it } from 'vitest';
import { evaluateReadCheck, type ReadCheckInput } from './read-check';

const base: ReadCheckInput = {
  projectConfigured: true,
  onVercel: true,
  vercelEnv: 'production',
  tokenConfigured: true,
  tokenRead: { state: 'ok' },
  anonymousCount: 0,
  customPathTypes: { blogAutomationRun: 18 },
};
const run = (over: Partial<ReadCheckInput>) => evaluateReadCheck({ ...base, ...over });
const text = (r: { lines: string[] }) => r.lines.join('\n');

describe('the prebuild check', () => {
  it('passes a Vercel build whose token reads a private dataset', () => {
    const r = run({});
    expect(r.pass).toBe(true);
    expect(text(r)).toContain('ok: SANITY_API_READ_TOKEN reads the dataset');
    expect(text(r)).toContain('dataset visibility: private');
  });

  it('FAILS a Vercel build with no token, naming the variable and the environment', () => {
    for (const vercelEnv of ['production', 'preview']) {
      const r = run({ tokenConfigured: false, tokenRead: null, vercelEnv });
      expect(r.pass).toBe(false);
      expect(text(r)).toContain('SANITY_API_READ_TOKEN is not set');
      expect(text(r)).toContain(`the ${vercelEnv} environment`);
      expect(text(r)).toContain('previous deployment keeps serving');
    }
  });

  it('only WARNS a local build with no token (local builds are not the deploy path)', () => {
    const r = run({ onVercel: false, vercelEnv: null, tokenConfigured: false, tokenRead: null });
    expect(r.pass).toBe(true);
    expect(text(r)).toContain('WARNING');
    expect(text(r)).toContain('.env.local');
  });

  it('skips the CI build, which has no real project', () => {
    const r = run({ projectConfigured: false, tokenConfigured: false, tokenRead: null, onVercel: false });
    expect(r.pass).toBe(true);
    expect(text(r)).toContain('skipped');
  });

  it('FAILS on a rejected token, a token that cannot read, and an unreachable Sanity, anywhere', () => {
    for (const onVercel of [true, false]) {
      expect(run({ onVercel, tokenRead: { state: 'rejected', detail: 'HTTP 401' } }).pass).toBe(false);
      expect(run({ onVercel, tokenRead: { state: 'cannot-read', detail: 'no document' } }).pass).toBe(false);
      expect(run({ onVercel, tokenRead: { state: 'error', detail: 'ETIMEDOUT' } }).pass).toBe(false);
    }
    expect(text(run({ tokenRead: { state: 'rejected', detail: 'HTTP 401' } }))).toContain('revoked, mistyped');
    expect(text(run({ tokenRead: { state: 'cannot-read', detail: 'x' } }))).toContain('Viewer role');
  });

  it('reports a still-public dataset without failing (the code ships before the flip)', () => {
    const r = run({ anonymousCount: 4295 });
    expect(r.pass).toBe(true);
    expect(text(r)).toContain('PUBLIC (an anonymous query sees 4295 documents)');
  });

  it('lists custom-path types: the expected ones quietly, anything else as a warning', () => {
    expect(text(run({ customPathTypes: {} }))).toContain('custom ID path visible to the token: none');
    const expected = text(run({ customPathTypes: { blogAutomationRun: 18, 'system.group': 3 } }));
    expect(expected).toContain('blogAutomationRun 18');
    expect(expected).not.toContain('WARNING');
    const surprise = run({ customPathTypes: { blogAutomationRun: 18, productPage: 2 } });
    expect(surprise.pass).toBe(true);
    expect(text(surprise)).toContain('WARNING: unexpected types in a custom ID path: productPage 2');
  });

  it('never prints anything that looks like a token', () => {
    const all = [
      run({}),
      run({ tokenConfigured: false, tokenRead: null }),
      run({ tokenRead: { state: 'rejected', detail: 'HTTP 401: Unauthorized - Session not found' } }),
    ].flatMap((r) => r.lines);
    expect(all.join('\n')).not.toMatch(/\bsk[A-Za-z0-9]{20,}/);
  });
});

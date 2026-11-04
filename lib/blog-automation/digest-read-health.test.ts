/**
 * SEC-100 guard 3: the morning digest leads with a broken Sanity read and
 * marks the subject, so Patrick's inbox says it the morning after.
 */
import { describe, expect, it } from 'vitest';
import { buildDigestEmail, type DigestInput } from './digest';

const base: DigestInput = {
  day: '2026-10-26',
  runs: [],
  switches: { paused: false, publishMode: 'draft' },
  imageCap: { used: 0, cap: 20 },
  sweep: null,
  siteUrl: 'https://www.perfectimprints.com',
  studioPath: '/admin3773752',
  slots: 2,
};

describe('the digest and the site read health', () => {
  it('a failing read leads the email and marks the subject', () => {
    const email = buildDigestEmail({ ...base, readHealth: { ok: false, message: 'SANITY_API_READ_TOKEN is NOT set on this deployment.' } });
    expect(email.subject.startsWith('[Needs attention] ')).toBe(true);
    expect(email.text.split('\n')[0]).toBe('SITE DATA: SANITY_API_READ_TOKEN is NOT set on this deployment.');
    expect(email.html.indexOf('Site data:')).toBeLessThan(email.html.indexOf('<h2'));
  });

  it('a check that could not run is also flagged', () => {
    const email = buildDigestEmail({ ...base, readHealth: null });
    expect(email.subject.startsWith('[Needs attention] ')).toBe(true);
    expect(email.text).toContain('/api/health/sanity');
  });

  it('a healthy read is one quiet footer line and an unmarked subject', () => {
    const email = buildDigestEmail({ ...base, readHealth: { ok: true, message: 'The site reads Sanity with its read token. Customer data is not publicly readable.' } });
    expect(email.subject.startsWith('[Needs attention]')).toBe(false);
    expect(email.text).toContain('Site data: The site reads Sanity with its read token.');
  });

  it('a caller that does not check (undefined) gets exactly the email it always got', () => {
    const withField = buildDigestEmail({ ...base, readHealth: undefined });
    const without = buildDigestEmail(base);
    expect(withField).toEqual(without);
    expect(without.subject.startsWith('[Needs attention]')).toBe(false);
  });
});

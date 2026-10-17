/**
 * AUTO-208 Part 1: the production lock and the cron secret. The one check
 * that keeps two schedulers (staging and production deploy the same
 * vercel.json) from writing into one blog.
 */
import { describe, expect, it } from 'vitest';
import { NON_PRODUCTION_HOSTS, PRODUCTION_HOST } from '../seo/indexing-policy';
import { authorizeCronRequest, bearerToken, isProductionSiteUrl, type CronAuthDecision } from './scheduler-auth';

/** Asserts a refusal and narrows to it (vitest's expect does not narrow for TypeScript). */
function refused(d: CronAuthDecision): Extract<CronAuthDecision, { ok: false }> {
  if (d.ok === true) throw new Error('expected a refusal, got ok');
  return d;
}

const SECRET = 'a-long-random-secret-of-at-least-sixteen';
const PROD = `https://${PRODUCTION_HOST}`;
const STAGING = `https://${NON_PRODUCTION_HOSTS[0]}`;
const good = `Bearer ${SECRET}`;

describe('the production lock (host first, fails closed)', () => {
  it('runs on the production host with the right secret, in every spelling of the URL', () => {
    for (const url of [PROD, `${PROD}/`, ` ${PROD} `, `HTTPS://${PRODUCTION_HOST.toUpperCase()}`, `${PROD}:443`, PRODUCTION_HOST]) {
      const d = authorizeCronRequest({ siteUrl: url, cronSecret: SECRET, authorization: good });
      expect(d, url).toEqual({ ok: true, host: PRODUCTION_HOST });
    }
  });

  it('REFUSES the staging host even with the right secret (403, named reason)', () => {
    const d = refused(authorizeCronRequest({ siteUrl: STAGING, cronSecret: SECRET, authorization: good }));
    expect(d.status).toBe(403);
    expect(d.reason).toBe('not-production-host');
    expect(d.host).toBe(NON_PRODUCTION_HOSTS[0]);
    expect(d.message).toContain('production deployment only');
    expect(d.message).not.toContain(SECRET);
  });

  it('REFUSES an unset, blank, unparseable, localhost or unlisted host: the opposite of the indexing policy', () => {
    for (const url of [undefined, null, '', '   ', 'not a url', 'http://localhost:3000', 'https://example.com', 'https://perfectimprints.com', `https://staging-${PRODUCTION_HOST}`]) {
      const d = refused(authorizeCronRequest({ siteUrl: url, cronSecret: SECRET, authorization: good }));
      expect(d.status, String(url)).toBe(403);
    }
    expect(isProductionSiteUrl(undefined)).toBe(false);
    expect(isProductionSiteUrl(PROD)).toBe(true);
  });

  it('checks the host BEFORE the secret: a staging deployment with no secret is refused for the host, not the secret', () => {
    const d = refused(authorizeCronRequest({ siteUrl: STAGING, cronSecret: undefined, authorization: null }));
    expect(d.reason).toBe('not-production-host');
  });
});

describe('the secret', () => {
  it('an unset CRON_SECRET on production is a 503 configuration fault naming the variable, never a run', () => {
    for (const secret of [undefined, null, '', '   ']) {
      const d = refused(authorizeCronRequest({ siteUrl: PROD, cronSecret: secret, authorization: good }));
      expect(d.status).toBe(503);
      expect(d.reason).toBe('secret-unset');
      expect(d.message).toContain('CRON_SECRET');
    }
  });

  it('a missing, malformed or wrong Authorization header is a 401 that says nothing about the secret', () => {
    const cases: [string | null, 'header-missing' | 'secret-wrong'][] = [
      [null, 'header-missing'],
      ['', 'header-missing'],
      [SECRET, 'header-missing'],
      ['Basic abc', 'header-missing'],
      [`Bearer ${SECRET}x`, 'secret-wrong'],
      [`Bearer ${SECRET.slice(0, -1)}`, 'secret-wrong'],
      ['Bearer wrong', 'secret-wrong'],
    ];
    for (const [header, reason] of cases) {
      const d = refused(authorizeCronRequest({ siteUrl: PROD, cronSecret: SECRET, authorization: header }));
      expect(d.status, String(header)).toBe(401);
      expect(d.reason).toBe(reason);
      expect(d.message).toBe('Unauthorized.');
    }
  });

  it('reads the bearer token tolerantly (case, spacing) and nothing else', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('  Bearer   abc  ')).toBe('abc');
    expect(bearerToken('Token abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

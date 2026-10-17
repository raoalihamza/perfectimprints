/**
 * Who may fire the blog scheduler (AUTO-208, Part 1): ONLY a Vercel cron
 * invocation of the PRODUCTION deployment, carrying the production
 * CRON_SECRET. Pure apart from node:crypto; no next/*, no Sanity.
 *
 * THE LANDMINE THIS EXISTS FOR. A `vercel.json` cron registers on EVERY Vercel
 * project that deploys the file, and staging is its own project on a mirrored
 * repo (CLAUDE.md Section 13): both projects deploy the same `vercel.json`,
 * both answer 200, and both `.env.local` files name the same Sanity dataset.
 * Without this check two schedulers would write into one blog, four posts a
 * day instead of two, each pair on different topics because each would read
 * the other's drafts. So the route refuses to run anywhere but the production
 * host, decided the way FIX-890 decides it (lib/seo/indexing-policy.ts): the
 * host of NEXT_PUBLIC_SITE_URL, parsed with `new URL()` so a scheme, a port, a
 * trailing slash or a stray space cannot change the answer. VERCEL_ENV is not
 * the signal, because both projects read `production` there.
 *
 * THIS RULE FAILS CLOSED, the OPPOSITE direction from the indexing policy, on
 * purpose. The indexing policy noindexes only a LISTED non-production host,
 * because a typo in the production variable must never take the real site out
 * of Google. Here the cost of a wrong answer is reversed: a typo that stops the
 * scheduler is a missed morning post, visible in the digest and fixed in a
 * minute; a typo that let a second host run would write into Patrick's blog.
 * So the scheduler runs ONLY when the host is exactly PRODUCTION_HOST: unset,
 * blank, unparseable, localhost, the staging host and every unlisted host are
 * all refused.
 *
 * THE SECRET. Vercel sends `Authorization: Bearer <CRON_SECRET>` when the
 * project has that variable (docs read 2026-10-17). The comparison is constant
 * time, the variable is never logged, and the header's value is never echoed.
 * A missing variable is a configuration fault (503, "Ali: set CRON_SECRET"),
 * a missing or wrong header is a plain refusal (401). The host is checked
 * FIRST so that a staging deployment where somebody copied the secret is still
 * refused, and refused for the right reason.
 *
 * Nothing here reads the environment: the routes pass the three values in, so
 * the tests prove every combination without touching it.
 */
import { timingSafeEqual } from 'node:crypto';
import { PRODUCTION_HOST, siteUrlHost } from '../seo/indexing-policy';

/** The header Vercel puts the cron secret in. */
export const CRON_AUTH_HEADER = 'authorization';

/** The environment variable Vercel reads the secret from (set by Ali, in the PRODUCTION project only). */
export const CRON_SECRET_ENV = 'CRON_SECRET';

export type CronAuthDecision =
  | { ok: true; host: string }
  | {
      ok: false;
      status: 401 | 403 | 503;
      reason: 'not-production-host' | 'secret-unset' | 'header-missing' | 'secret-wrong';
      /** Safe to log and to return: never contains the secret or the header's value. */
      message: string;
      host: string | null;
    };

export interface CronAuthInput {
  /** The site URL variable's value, as the route reads it from the environment. */
  siteUrl: string | undefined | null;
  /** The cron secret variable's value, as the route reads it from the environment. */
  cronSecret: string | undefined | null;
  /** The request's Authorization header, or null. */
  authorization: string | null | undefined;
}

/** True when the site URL names the production host and nothing else. */
export function isProductionSiteUrl(siteUrl: string | undefined | null): boolean {
  return siteUrlHost(siteUrl) === PRODUCTION_HOST;
}

/** Constant-time string equality; unequal lengths are unequal without leaking which. */
function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The bearer token in an Authorization header, or null when the header is not a bearer. */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (typeof authorization !== 'string') return null;
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(authorization);
  return m ? m[1] : null;
}

/**
 * Decide whether this invocation may run. Host first, then the secret.
 */
export function authorizeCronRequest(input: CronAuthInput): CronAuthDecision {
  const host = siteUrlHost(input.siteUrl);
  if (host !== PRODUCTION_HOST) {
    return {
      ok: false,
      status: 403,
      reason: 'not-production-host',
      message: `The blog scheduler runs on the production deployment only; this deployment's site URL host is ${host ?? 'unset'}. Nothing was run.`,
      host,
    };
  }
  const expected = typeof input.cronSecret === 'string' ? input.cronSecret.trim() : '';
  if (!expected) {
    return {
      ok: false,
      status: 503,
      reason: 'secret-unset',
      message: `${CRON_SECRET_ENV} is not set in this environment, so the scheduler cannot tell a Vercel cron from anyone else and refuses to run. Ali: set it in the production Vercel project.`,
      host,
    };
  }
  const presented = bearerToken(input.authorization);
  if (presented === null) {
    return { ok: false, status: 401, reason: 'header-missing', message: 'Unauthorized.', host };
  }
  if (!secretsMatch(presented, expected)) {
    return { ok: false, status: 401, reason: 'secret-wrong', message: 'Unauthorized.', host };
  }
  return { ok: true, host };
}

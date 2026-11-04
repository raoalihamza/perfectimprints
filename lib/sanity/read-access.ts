/**
 * SEC-100: what a Sanity READ failure means once the dataset is private.
 *
 * The production dataset used to answer anonymous queries, so lead
 * submissions, quotes (with their private link tokens) and quote responses
 * were readable by anyone. It is now private, and every site read carries a
 * server-only read token (`SANITY_API_READ_TOKEN`, read in exactly one place:
 * lib/sanity/client.ts).
 *
 * The danger this module exists for: Sanity answers an unauthenticated query
 * against a private dataset with HTTP 200 and an EMPTY result, not an error
 * (https://www.sanity.io/docs/content-lake/datasets). Every read on this site
 * was written to treat a failure as "render the fallback", so a missing token
 * would not fail anything. It would gut the site quietly: an empty header
 * menu on every page, 404s on every blog post and product page, Patrick's
 * category curation ignored, and Next caching each of those as the page.
 *
 * So a read with no usable credential must be an ERROR, and that error must
 * never be swallowed into a fallback on a cached render:
 *
 *  - `SanityReadTokenMissingError` is what the read client throws instead of
 *    sending an anonymous query, when a real project is configured and the
 *    token is absent (lib/sanity/client.ts).
 *  - A rejected token (revoked, mistyped) comes back from Sanity as a 401;
 *    a token without read access as a 403.
 *  - `rethrowIfSanityAccessError(err)` is the first statement of every catch
 *    that wraps a Sanity read on a render path, so those errors propagate: a
 *    prebuilt page fails its build, an ISR re-render fails and Next keeps
 *    serving the last good copy, and a page never rendered before answers a
 *    500 rather than a hollow 200. Every OTHER failure keeps the fallback it
 *    always had. Guarded by lib/sanity/read-access.test.ts.
 *  - Routes where losing the request is worse than degrading (the lead form)
 *    use `degradeOnSanityAccessError` instead: same fallback as a Sanity
 *    outage, plus a loud log line.
 *
 * Pure and dependency-free so the Studio-free scripts (tsx) and the tests can
 * import it.
 */

/** The one name of the read token's environment variable. Server-only: never NEXT_PUBLIC_. */
export const SANITY_READ_TOKEN_ENV = 'SANITY_API_READ_TOKEN';

/** The project id CI builds with (.github/workflows/ci.yml): no Sanity at all, so no token is required. */
export const PLACEHOLDER_PROJECT_ID = 'placeholder';

/** True when a real Sanity project is configured (so a read with no token is a fault, not a CI build). */
export function isConfiguredSanityProject(projectId: string | null | undefined): boolean {
  const id = (projectId ?? '').trim();
  return id.length > 0 && id !== PLACEHOLDER_PROJECT_ID;
}

export class SanityReadTokenMissingError extends Error {
  /** Same family as a rejected token: the request has no usable credential. */
  readonly statusCode = 401;

  constructor() {
    super(
      `${SANITY_READ_TOKEN_ENV} is not set, so this server cannot read the Sanity dataset (it is private). ` +
        `Nothing was read. Set ${SANITY_READ_TOKEN_ENV} in this environment and redeploy.`,
    );
    this.name = 'SanityReadTokenMissingError';
  }
}

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { statusCode?: unknown; response?: { statusCode?: unknown } };
  const status = typeof e.statusCode === 'number' ? e.statusCode : e.response?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * True for a read that failed because it had no usable credential: the token
 * is missing, rejected (401) or lacks read access (403). A network failure, a
 * 404 (the CI placeholder project) or a 5xx is NOT one: those keep their
 * fallbacks exactly as before.
 */
export function isSanityAccessError(err: unknown): boolean {
  if (err instanceof SanityReadTokenMissingError) return true;
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'SanityReadTokenMissingError') return true;
  const status = statusOf(err);
  return status === 401 || status === 403;
}

/**
 * The first statement of a catch that wraps a Sanity read on a render path.
 * Re-throws a credential failure so it can never be cached as an empty page;
 * returns normally for anything else, so the catch's own fallback still runs.
 */
export function rethrowIfSanityAccessError(err: unknown): void {
  if (isSanityAccessError(err)) throw err;
}

/**
 * For request handlers where degrading beats failing (the lead form must still
 * email Patrick): run the read; on a credential failure log loudly and return
 * the fallback, the same answer a Sanity outage has always produced. Any other
 * error is the read's own business and propagates unchanged.
 */
export async function degradeOnSanityAccessError<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (!isSanityAccessError(err)) throw err;
    console.error(
      `[sanity-read] ${label}: the read token was missing or rejected, so the fallback was used. ` +
        `Check ${SANITY_READ_TOKEN_ENV} in this deployment. ${err instanceof Error ? err.message : ''}`.trim(),
    );
    return fallback;
  }
}

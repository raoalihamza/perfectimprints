/**
 * SEC-100: is the site's read of the private dataset healthy RIGHT NOW?
 *
 * Two questions, asked live (never from a cache), answered in words:
 *
 *  1. Does THIS deployment's read token read the dataset? A token read of the
 *     `globalSettings` singleton through the site's own read client, so the
 *     answer is about the exact client every page uses.
 *  2. Is the dataset still readable WITHOUT a token? An anonymous `count(*)`.
 *     A private dataset answers 0 (HTTP 200, empty: Sanity's documented
 *     behaviour), a public one answers the number of published documents.
 *
 * Why a live check exists at all: once the dataset is private every page is
 * served from Next's cache, so a cached page proves nothing about whether the
 * token still works. This is the only thing that does, short of a publish.
 *
 * Used by the morning digest (app/api/cron/blog-digest/route.ts), which puts a
 * failure at the top of Patrick's email, and by GET /api/health/sanity, which
 * the post-flip script (scripts/security/verify-site-whole.ts) calls.
 *
 * Counts only: nothing here returns a document field.
 */
import { cachedClient, sanityReadTokenConfigured } from './client';
import { isConfiguredSanityProject, isSanityAccessError, SanityReadTokenMissingError } from './read-access';

export type ReadTokenState = 'ok' | 'missing' | 'rejected' | 'cannot-read' | 'error';
export type DatasetVisibility = 'private' | 'public' | 'unknown';

export interface SanityReadHealth {
  /** True only when the token reads AND the dataset refuses anonymous reads. */
  ok: boolean;
  readToken: ReadTokenState;
  dataset: DatasetVisibility;
  /** One plain sentence; safe to email or print (no data, no token). */
  message: string;
}

export interface ReadHealthDeps {
  projectId: string | undefined;
  /** The token read of the singleton's id, through the site's read client. */
  readSingletonId: () => Promise<unknown>;
  /** The anonymous document count. */
  countAnonymously: () => Promise<number>;
}

const SINGLETON_QUERY = `*[_id == "globalSettings"][0]._id`;

export function defaultReadHealthDeps(): ReadHealthDeps {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  return {
    projectId,
    readSingletonId: () => cachedClient.fetch(SINGLETON_QUERY, {}, { cache: 'no-store' }),
    countAnonymously: async () => {
      const url = `https://${projectId}.api.sanity.io/v2024-10-01/data/query/${encodeURIComponent(dataset)}?query=${encodeURIComponent('count(*)')}`;
      const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`anonymous read answered HTTP ${res.status}`);
      const body = (await res.json()) as { result?: unknown };
      if (typeof body.result !== 'number') throw new Error('anonymous read returned no count');
      return body.result;
    },
  };
}

/** Never throws: every failure is an answer. */
export async function checkSanityReadHealth(deps: ReadHealthDeps = defaultReadHealthDeps()): Promise<SanityReadHealth> {
  if (!isConfiguredSanityProject(deps.projectId)) {
    return { ok: false, readToken: 'missing', dataset: 'unknown', message: 'No Sanity project is configured on this server.' };
  }

  let readToken: ReadTokenState;
  try {
    const id = await deps.readSingletonId();
    readToken = id === 'globalSettings' ? 'ok' : 'cannot-read';
  } catch (err) {
    if (err instanceof SanityReadTokenMissingError || (!sanityReadTokenConfigured && isSanityAccessError(err))) readToken = 'missing';
    else if (isSanityAccessError(err)) readToken = 'rejected';
    else readToken = 'error';
  }

  let dataset: DatasetVisibility;
  try {
    dataset = (await deps.countAnonymously()) === 0 ? 'private' : 'public';
  } catch {
    dataset = 'unknown';
  }

  return { ok: readToken === 'ok' && dataset === 'private', readToken, dataset, message: healthMessage(readToken, dataset) };
}

export function healthMessage(readToken: ReadTokenState, dataset: DatasetVisibility): string {
  const token =
    readToken === 'ok'
      ? 'The site reads Sanity with its read token.'
      : readToken === 'missing'
        ? 'SANITY_API_READ_TOKEN is NOT set on this deployment, so the site cannot read Sanity: pages that re-render will fail and the last good copy is served. Ali: set it in Vercel and redeploy.'
        : readToken === 'rejected'
          ? 'Sanity REJECTED the site read token (revoked or mistyped), so the site cannot read Sanity: pages that re-render will fail and the last good copy is served. Ali: make a new Viewer token, set it in Vercel and redeploy.'
          : readToken === 'cannot-read'
            ? 'The site read token is accepted but cannot see Global Settings, so it has no read access to this dataset. Ali: check the token role is Viewer for this project.'
            : 'The site could not reach Sanity to check its read token (a network or Sanity outage). If this repeats tomorrow, Ali: check the Vercel log.';
  const data =
    dataset === 'private'
      ? 'Customer data is not publicly readable.'
      : dataset === 'public'
        ? 'The dataset is still PUBLIC: lead submissions and quotes can be read by anyone. Ali: set the production dataset to Private.'
        : 'Whether the dataset is private could not be checked.';
  return `${token} ${data}`;
}

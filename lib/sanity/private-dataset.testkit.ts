/**
 * SEC-100 test kit: a stand-in for the PRIVATE Sanity dataset, installed as
 * the global `fetch` (every site read passes `next` or `cache` options, and
 * `@sanity/client` then sends it through global fetch, verified in its Node
 * build), so tests drive the REAL read client and the REAL query modules.
 *
 * It answers the way Sanity documents a private dataset answering
 * (https://www.sanity.io/docs/content-lake/datasets):
 *  - no Authorization header: HTTP 200 with an EMPTY result in the requested
 *    shape (0 for a count, null for a single document, [] for a list). This
 *    is the silent failure SEC-100 guards against;
 *  - a wrong bearer token: HTTP 401;
 *  - the right token: whatever `answer` returns for that query.
 * Every request is recorded (query, params, perspective, whether it carried
 * the token) so a test can assert on what the site actually sent.
 *
 * Not a test file (no `.test.` in the name): imported by the SEC-100 tests.
 */

export interface SimRequest {
  query: string;
  params: Record<string, unknown>;
  perspective: string | null;
  /** The Authorization header exactly as sent, or null. */
  authorization: string | null;
  /** True when it carried the simulator's token. */
  authorized: boolean;
}

export interface PrivateDatasetOptions {
  /** The one token this "dataset" accepts. */
  token: string;
  /** The answer for an authorized query; undefined means "no such document" (the empty shape). */
  answer?: (req: SimRequest) => unknown;
  /** Force a status for an authorized query (e.g. 401 to model a revoked token). */
  statusFor?: (req: SimRequest) => number | undefined;
}

export function emptyShapeFor(query: string): unknown {
  const q = query.trim();
  if (/^count\(/.test(q)) return 0;
  if (/\[\s*0\s*\]/.test(q)) return null;
  if (q.startsWith('{')) return {};
  return [];
}

export function installPrivateDataset(opts: PrivateDatasetOptions): { requests: SimRequest[]; restore: () => void } {
  const original = globalThis.fetch;
  const requests: SimRequest[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!/\.api\.sanity\.io$/.test(url.hostname) || !url.pathname.includes('/data/query/')) {
      throw new Error(`private-dataset testkit: unexpected request to ${url.hostname}${url.pathname}`);
    }
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    const params: Record<string, unknown> = {};
    url.searchParams.forEach((value, key) => {
      if (key.startsWith('$')) {
        try {
          params[key.slice(1)] = JSON.parse(value);
        } catch {
          params[key.slice(1)] = value;
        }
      }
    });
    let query = url.searchParams.get('query') ?? '';
    // Long queries go as a POST body ({ query, params }).
    if (!query && typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body) as { query?: string; params?: Record<string, unknown> };
        query = body.query ?? '';
        Object.assign(params, body.params ?? {});
      } catch {
        /* not JSON: leave the query empty */
      }
    }
    const req: SimRequest = {
      query,
      params,
      perspective: url.searchParams.get('perspective'),
      authorization,
      authorized: authorization === `Bearer ${opts.token}`,
    };
    requests.push(req);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (authorization && !req.authorized) {
      return json(401, { error: 'Unauthorized', message: 'Session not found', statusCode: 401 });
    }
    if (!authorization) return json(200, { result: emptyShapeFor(query), ms: 1, query });
    const forced = opts.statusFor?.(req);
    if (forced && forced !== 200) {
      return json(forced, { error: forced === 401 ? 'Unauthorized' : 'Error', message: 'Simulated failure', statusCode: forced });
    }
    const answer = opts.answer?.(req);
    return json(200, { result: answer === undefined ? emptyShapeFor(query) : answer, ms: 1, query });
  };
  globalThis.fetch = fake as typeof fetch;
  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

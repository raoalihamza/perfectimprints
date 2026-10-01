/**
 * Google Search Console client (AUTO-100, extracted to a module by AUTO-110).
 *
 * The connection AUTO-100 proved, now shared by the read-only measuring script
 * (scripts/blog-automation/gsc-opportunity-pool.ts) and the Blog Topics route
 * (app/api/sanity/blog-topics/route.ts via lib/blog-automation/build-topic-pool.ts)
 * instead of living inside the script. Nothing here was redesigned; the
 * functions are the script's, with `process.exit` replaced by a thrown
 * `GscError` that carries the same hint for Ali.
 *
 * Rules that must hold:
 *   - GSC_SERVICE_ACCOUNT_JSON_B64 is server-side only and is NEVER printed,
 *     logged or placed in an error message, not even a fragment. Every error
 *     built here names the variable, never its value; the token exchange error
 *     repeats Google's error code and description and nothing else.
 *   - The JWT is minted with Node's own crypto (RS256); no Google client
 *     library is installed and none is added.
 *   - The scope is read-only (webmasters.readonly). This module cannot write
 *     anything to Search Console.
 *   - Search Analytics returns "top rows", not all rows, and at most 25,000 a
 *     request, so `searchAnalyticsAll` pages with `startRow` until an EMPTY
 *     page, the rule AUTO-100 established.
 *   - The property to use is the URL-prefix one, `URL_PREFIX_PROPERTY`. The
 *     domain property carries feeds.perfectimprints.com and the staging host,
 *     which must never feed a blog topic pool for www. A wrong property string
 *     returns HTTP 403 on this account, not an empty result.
 *
 * Server only (node:crypto). Never import from Studio bundle code.
 */

import { sign as cryptoSign } from 'node:crypto';
import { GSC_PROPERTY } from './topic-pool';

/** The exact API string of the Search Console property the blog pool reads (spelled once, in topic-pool.ts). */
export const URL_PREFIX_PROPERTY = GSC_PROPERTY;
/** The other property the service account can see; NOT used for the pool. */
export const DOMAIN_PROPERTY = 'sc-domain:perfectimprints.com';
/** Google's per-request row ceiling for Search Analytics. */
export const ROW_LIMIT = 25_000;
/** Google keeps Search Analytics for 16 months. */
export const RETENTION_DAYS = 16 * 31;

export const GSC_KEY_ENV = 'GSC_SERVICE_ACCOUNT_JSON_B64';

/**
 * Every failure this module raises. `hint` is the sentence for Ali (what to
 * check), `status` the HTTP status from Google when there was one. Neither
 * ever contains key material.
 */
export class GscError extends Error {
  readonly hint: string;
  readonly status: number | null;

  constructor(message: string, hint: string, status: number | null = null) {
    super(message);
    this.name = 'GscError';
    this.hint = hint;
    this.status = status;
  }
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * Decode the base64 service-account key. Throws a GscError naming the variable
 * (never its value) when it is unset, not base64 JSON, or not a service
 * account key.
 */
export function decodeServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw || !raw.trim()) {
    throw new GscError(
      `${GSC_KEY_ENV} is not set.`,
      `Ali: add ${GSC_KEY_ENV} to .env.local and Vercel as the base64 of the service account JSON key ` +
        'downloaded from Google Cloud > IAM > Service Accounts > search-console-reader@steadfast-tesla-478917-b2 > Keys. ' +
        'Server-side only, no NEXT_PUBLIC_ prefix.',
    );
  }
  let parsed: Partial<ServiceAccount> & { type?: string };
  try {
    parsed = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
  } catch {
    throw new GscError(
      `${GSC_KEY_ENV} does not decode to JSON.`,
      'Ali: re-encode the whole key file with [Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json")) ' +
        'and paste the single-line result.',
    );
  }
  if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
    throw new GscError(
      `${GSC_KEY_ENV} decodes, but not to a service account key.`,
      'Ali: expected type "service_account" with client_email and private_key; check the right file was encoded.',
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri,
  };
}

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Exchange a self-signed service-account JWT for a read-only access token. */
export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = cryptoSign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    // Only Google's error code + description are repeated; never the assertion.
    throw new GscError(
      `Token exchange failed: HTTP ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim(),
      'Ali: the key decodes but Google rejects it. If the key was deleted or the service account disabled in ' +
        'Google Cloud, create a new key and re-encode it.',
      res.status,
    );
  }
  return body.access_token;
}

export interface SiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

export interface SaRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SaDimensionFilter {
  dimension: 'query' | 'page' | 'country' | 'device';
  operator: 'equals' | 'contains' | 'notContains' | 'includingRegex' | 'excludingRegex';
  expression: string;
}

export interface SaRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
  startRow?: number;
  dataState?: 'final' | 'all';
  type?: string;
  dimensionFilterGroups?: { groupType: 'and'; filters: SaDimensionFilter[] }[];
}

/**
 * How many exact searches one regex-filtered request may name (AUTO-121).
 * Measured 2026-10-01 against the live property: an alternation of 100
 * searches (about 2,400 characters) and of 150 (3,700) answer in 3.3 to
 * 3.7 s with rows identical to the unfiltered pull's; 200 (5,100 characters)
 * and above answer HTTP 500 "backendError". 100 keeps a wide margin under
 * that, and a batch that still fails is split in half and retried.
 */
export const QUERY_REGEX_BATCH = 100;
/** Regex-filtered requests in flight at once; independent requests, well inside Google's per-site rate. */
export const QUERY_REGEX_CONCURRENCY = 4;

export interface SaRequestLog {
  property: string;
  body: SaRequest;
  rows: number;
}

export interface GscClient {
  listSites(): Promise<SiteEntry[]>;
  searchAnalytics(property: string, body: SaRequest): Promise<SaRow[]>;
  /** Every row for the dimensions, paginated until an EMPTY page. */
  searchAnalyticsAll(
    property: string,
    base: Omit<SaRequest, 'rowLimit' | 'startRow'>,
  ): Promise<{ rows: SaRow[]; pages: number; lastPageRows: number }>;
  /**
   * Every row for the dimensions, restricted to an exact LIST of searches
   * (AUTO-121): the list goes to Google as an anchored regex alternation, in
   * batches of QUERY_REGEX_BATCH, QUERY_REGEX_CONCURRENCY at a time. Built
   * because the unfiltered 16-month query x page pull is 318,000 rows over 14
   * pages and 178 s (measured 2026-10-01), while the pool needs the pages of
   * about 2,000 searches, which this fetches in about 24 requests.
   */
  searchAnalyticsForQueries(
    property: string,
    base: Omit<SaRequest, 'rowLimit' | 'startRow' | 'dimensionFilterGroups'>,
    queries: readonly string[],
  ): Promise<{ rows: SaRow[]; requests: number }>;
}

/** A search as a regex atom that matches exactly that search (RE2 syntax, what Google runs). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function permissionHint(property: string): string {
  return (
    `Ali: HTTP 403 means the property string is wrong or the service account has no permission on it. ` +
    `The pool reads "${URL_PREFIX_PROPERTY}" (the URL-prefix property, trailing slash included); ` +
    `this request used "${property}". Search Console > that property > Settings > Users and permissions must list the service account.`
  );
}

/**
 * A client bound to one access token. `onRequest` receives every Search
 * Analytics request made (the AUTO-100 report lists them in its appendix).
 */
export function createGscClient(
  token: string,
  opts: { onRequest?: (entry: SaRequestLog) => void } = {},
): GscClient {
  const auth = { authorization: `Bearer ${token}` };

  async function listSites(): Promise<SiteEntry[]> {
    const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: auth });
    if (!res.ok) {
      throw new GscError(
        `sites.list failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
        'Ali: the token was accepted but Google refused to list properties; check the API is enabled on the project.',
        res.status,
      );
    }
    const body = (await res.json()) as { siteEntry?: SiteEntry[] };
    return body.siteEntry ?? [];
  }

  async function searchAnalytics(property: string, body: SaRequest): Promise<SaRow[]> {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      throw new GscError(
        `searchAnalytics.query ${property} HTTP ${res.status}: ${text}`,
        res.status === 403
          ? permissionHint(property)
          : res.status === 429
            ? 'Ali: Google is rate limiting the account; wait a minute and press Refresh again.'
            : 'Ali: Google answered with an error; try again, and if it persists check the Search Console API status.',
        res.status,
      );
    }
    const parsed = (await res.json()) as { rows?: SaRow[] };
    const rows = parsed.rows ?? [];
    opts.onRequest?.({ property, body, rows: rows.length });
    return rows;
  }

  async function searchAnalyticsAll(
    property: string,
    base: Omit<SaRequest, 'rowLimit' | 'startRow'>,
  ): Promise<{ rows: SaRow[]; pages: number; lastPageRows: number }> {
    const rows: SaRow[] = [];
    let startRow = 0;
    let pages = 0;
    let lastPageRows = -1;
    for (;;) {
      const page = await searchAnalytics(property, { ...base, rowLimit: ROW_LIMIT, startRow });
      pages += 1;
      lastPageRows = page.length;
      rows.push(...page);
      if (page.length === 0) break;
      startRow += page.length;
      if (pages > 40) break; // 1,000,000 rows; a runaway guard, never expected
    }
    return { rows, pages, lastPageRows };
  }

  async function searchAnalyticsForQueries(
    property: string,
    base: Omit<SaRequest, 'rowLimit' | 'startRow' | 'dimensionFilterGroups'>,
    queries: readonly string[],
  ): Promise<{ rows: SaRow[]; requests: number }> {
    const unique = [...new Set(queries.filter((q) => q.trim()))];
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += QUERY_REGEX_BATCH) batches.push(unique.slice(i, i + QUERY_REGEX_BATCH));
    const rows: SaRow[] = [];
    let requests = 0;

    async function fetchBatch(batch: string[]): Promise<void> {
      const expression = `^(${batch.map(escapeRegex).join('|')})$`;
      const body: SaRequest = {
        ...base,
        rowLimit: ROW_LIMIT,
        dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'includingRegex', expression }] }],
      };
      requests += 1;
      try {
        const page = await searchAnalytics(property, body);
        rows.push(...page);
        // A batch of 100 searches never fills a 25,000-row page (a search
        // ranks on a handful of pages); if one ever did, the rest would be
        // lost, so it is fetched again in halves rather than trusted.
        if (page.length >= ROW_LIMIT && batch.length > 1) {
          rows.splice(rows.length - page.length, page.length);
          throw new GscError('regex batch overflowed a page', 'split', 500);
        }
      } catch (err) {
        // Google answers HTTP 500 to an expression it finds too long; halve and retry.
        if (err instanceof GscError && err.status === 500 && batch.length > 1) {
          const mid = Math.ceil(batch.length / 2);
          await fetchBatch(batch.slice(0, mid));
          await fetchBatch(batch.slice(mid));
          return;
        }
        throw err;
      }
    }

    let next = 0;
    const workers = Array.from({ length: Math.min(QUERY_REGEX_CONCURRENCY, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next];
        next += 1;
        await fetchBatch(batch);
      }
    });
    await Promise.all(workers);
    return { rows, requests };
  }

  return { listSites, searchAnalytics, searchAnalyticsAll, searchAnalyticsForQueries };
}

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The UTC date `n` days ago as YYYY-MM-DD. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

/**
 * True when an error message could carry key material (a defensive check the
 * script and the route both apply before repeating any message to a caller).
 */
export function mentionsKeyMaterial(message: string): boolean {
  return message.includes('private_key') || message.includes('BEGIN ');
}

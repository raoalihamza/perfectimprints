/**
 * The DataForSEO connection (AUTO-124), the network half of the search-volume
 * refresh. It lives under scripts/ ON PURPOSE: it runs on Ali's machine and
 * nowhere else. Nothing under app/, lib/, components/ or sanity/ may import
 * it or read its two variables, and the variables are never set in Vercel;
 * the site reads the committed file and calls no keyword API (a structural
 * test in lib/blog-automation/volume-refresh.test.ts holds all of that).
 *
 * Credentials: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD from `.env.local`,
 * sent as HTTP Basic auth. They are read in ONE place (`authHeader`) and are
 * never printed, logged or put in an error: an error carries the HTTP status
 * and DataForSEO's own status code and message, nothing else.
 *
 * What is free and what is paid. `appendix/user_data` (balance and price
 * list), `keywords_data/google_ads/status` and the locations and languages
 * lists cost nothing. The ONE paid call is `searchVolumeLive`, and it is
 * never retried here: a retry after a lost answer could pay twice, so the
 * caller keeps the reservation and the next run simply asks again for
 * whatever was not written.
 */

import { SEARCH_VOLUME_LIVE_PATH, usdToCents } from '../../lib/blog-automation/volume-refresh';

const API_BASE = 'https://api.dataforseo.com/v3/';

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = 'DataForSeoError';
  }
}

/** True when both variables are set. Says nothing about whether they are right. */
export function hasCredentials(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new DataForSeoError('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set. Put them in .env.local of the repo you run this from (never in Vercel).');
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

async function request(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DataForSeoError) throw e;
    // The cause can never hold the header: fetch reports the network failure only.
    throw new DataForSeoError(`DataForSEO could not be reached (${path}): ${e instanceof Error ? e.name : 'network error'}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new DataForSeoError(`DataForSEO answered HTTP ${res.status} with a body that is not JSON (${path})`, res.status);
  }
  if (!json || typeof json !== 'object') throw new DataForSeoError(`DataForSEO answered HTTP ${res.status} with an empty body (${path})`, res.status);
  return json as Record<string, unknown>;
}

/** The first task's result array of a FREE call, or a thrown error naming DataForSEO's own status. */
async function freeResult(path: string, timeoutMs = 60_000): Promise<unknown[]> {
  const json = await request('GET', path, undefined, timeoutMs);
  const task = Array.isArray(json.tasks) ? (json.tasks[0] as Record<string, unknown> | undefined) : undefined;
  const code = typeof json.status_code === 'number' ? json.status_code : null;
  const taskCode = task && typeof task.status_code === 'number' ? task.status_code : null;
  if (code !== 20000 || taskCode !== 20000) {
    const message = String((taskCode !== null && taskCode !== 20000 ? task?.status_message : json.status_message) ?? 'no message');
    const hint =
      (taskCode ?? code) === 40104
        ? ' The account is not verified for the API; that is done in the DataForSEO panel.'
        : code === 40100
          ? ' The login or password in .env.local is wrong.'
          : '';
    throw new DataForSeoError(`DataForSEO refused ${path}: ${taskCode ?? code} ${message}.${hint}`, null, taskCode ?? code);
  }
  return Array.isArray(task?.result) ? (task.result as unknown[]) : [];
}

export interface AccountSnapshot {
  balanceUsd: number;
  /** What the account's own price list charges for one Live search-volume task, in cents; null when the list could not be read. */
  livePriceCents: number | null;
  /** The account's own daily spending limit in USD (set in the DataForSEO panel); null when not reported. */
  dailyLimitUsd: number | null;
  /** Live search-volume calls allowed a minute; null when not reported. */
  liveCallsPerMinute: number | null;
}

const dig = (o: unknown, ...keys: string[]): unknown => keys.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);

/** FREE. The balance, the price of the one paid call, and the account's own limits. Never returns the login. */
export async function accountSnapshot(): Promise<AccountSnapshot> {
  const [result] = await freeResult('appendix/user_data');
  const balance = dig(result, 'money', 'balance');
  if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new DataForSeoError('DataForSEO did not report a balance.');
  const prices = dig(result, 'price', 'keywords_data', 'google_ads', 'search_volume', 'live', 'priority_normal');
  const perRequest = Array.isArray(prices) ? prices.find((p) => dig(p, 'cost_type') === 'per_request') : undefined;
  const limit = dig(result, 'money', 'limits', 'day', 'total');
  const perMinute = dig(result, 'rates', 'limits', 'minute', 'keywords_data', 'google_ads', 'search_volume', 'live');
  return {
    balanceUsd: balance,
    livePriceCents: usdToCents(dig(perRequest, 'cost')),
    dailyLimitUsd: typeof limit === 'number' ? limit : null,
    liveCallsPerMinute: typeof perMinute === 'number' ? perMinute : null,
  };
}

/** FREE. Which month Google Ads' own figures currently run to, and whether last month's are in yet. */
export async function googleAdsStatus(): Promise<{ actualData: boolean | null; dateUpdate: string | null; lastMonth: string | null }> {
  const [result] = await freeResult('keywords_data/google_ads/status');
  const year = dig(result, 'last_year_in_monthly_searches');
  const month = dig(result, 'last_month_in_monthly_searches');
  const actual = dig(result, 'actual_data');
  const updated = dig(result, 'date_update');
  return {
    actualData: typeof actual === 'boolean' ? actual : null,
    dateUpdate: typeof updated === 'string' ? updated : null,
    lastMonth: typeof year === 'number' && typeof month === 'number' ? `${year}-${String(month).padStart(2, '0')}` : null,
  };
}

/** FREE (a large answer, about 15 MB: run it from `check`, not on every refresh). What the API's own list says a location code is. */
export async function describeLocation(code: number, countryIso = 'us'): Promise<{ name: string; type: string; countryIso: string } | null> {
  const list = await freeResult(`keywords_data/google_ads/locations/${countryIso}`, 120_000);
  const hit = list.find((l) => dig(l, 'location_code') === code);
  return hit ? { name: String(dig(hit, 'location_name')), type: String(dig(hit, 'location_type')), countryIso: String(dig(hit, 'country_iso_code')) } : null;
}

/** FREE. The language name the API's own list gives a code. */
export async function describeLanguage(code: string): Promise<string | null> {
  const list = await freeResult('keywords_data/google_ads/languages');
  const hit = list.find((l) => dig(l, 'language_code') === code);
  return hit ? String(dig(hit, 'language_name')) : null;
}

/**
 * PAID: one Live task, the task price whatever the number of keywords (a
 * rejected task costs 0). Returns the raw JSON for `readLiveTask`. The caller
 * must have RESERVED the price against the cap before calling this; it is
 * never retried here.
 */
export async function searchVolumeLive(keywords: readonly string[], locationCode: number, languageCode: string): Promise<unknown> {
  return request('POST', SEARCH_VOLUME_LIVE_PATH, [{ location_code: locationCode, language_code: languageCode, keywords }], 180_000);
}

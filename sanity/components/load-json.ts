/**
 * Robust Studio-side JSON loader (M5-504 picker support).
 *
 * The build-time lists (`category-list.json`, `product-list.json`) live in the
 * Next app's `public/` folder. The EMBEDDED Studio (`/admin`, same origin as the
 * Next app) serves them at `/<file>`. The STANDALONE Studio (`sanity dev`, a
 * different dev server) does NOT serve Next's `public/`, so we also write a copy
 * to `sanity/static/` and try `/static/<file>` there.
 *
 * Tries each candidate, requires a JSON response (a SPA dev server may 200 with
 * its index.html for unknown paths — the content-type check rejects that), and
 * returns the first that parses. Returns null when none load, so the caller can
 * show a clear "couldn't load" message instead of a misleading "no match".
 */
export async function loadStudioJson<T>(filename: string): Promise<T | null> {
  const candidates = [`/${filename}`, `/static/${filename}`];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) continue; // skip SPA index.html fallbacks
      return (await res.json()) as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

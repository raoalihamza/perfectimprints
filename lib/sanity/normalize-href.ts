// ---------------------------------------------------------------------------
// Internal-href normalizer — slash tolerance for Sanity-entered links.
//
// Patrick enters footer / mega-menu link hrefs in Studio. An internal path
// entered WITHOUT a leading slash (e.g. `llm-info-perfect-imprints`) would be
// treated by Next's <Link> as a path relative to the current route and navigate
// somewhere wrong. This helper auto-prefixes `/` for bare internal paths so a
// link resolves correctly whether or not Patrick typed the slash.
//
// External / protocol / anchor hrefs are left untouched — only internal paths
// get the slash. Empty/undefined stays empty so existing drop behavior (a link
// still needs a non-empty label + href to render) is unchanged.
// ---------------------------------------------------------------------------

/** Hrefs that must NOT be treated as internal paths (no slash prepended). */
const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', '#'];

/**
 * Normalize a Sanity-entered link href.
 * - empty/undefined → '' (caller keeps its own drop behavior)
 * - external / protocol (`http(s)://`, `mailto:`, `tel:`) / anchor (`#`) → untouched
 * - already-absolute path (`/...`) → untouched
 * - bare internal path (`about`, `llm-info-perfect-imprints`) → `/` prepended
 */
export function normalizeHref(href: string | undefined | null): string {
  const t = href?.trim();
  if (!t) return '';
  if (EXTERNAL_PREFIXES.some((p) => t.toLowerCase().startsWith(p))) return t;
  if (t.startsWith('/')) return t;
  return `/${t}`;
}

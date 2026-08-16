/**
 * SCRAPE-910 - pure comparison rules for the monthly rebuild data-loss guard.
 *
 * The runnable script is scripts/monthly/verify-rebuild-data.ts; this module
 * holds the side-effect-free logic so vitest can exercise the pass/fail
 * decisions (rebuild-data-guard.test.ts) without touching git or the real
 * data files. Keep every rule here, never inline in the runner, so the
 * tested code is the code that gates the run.
 *
 * Why these three metrics and these margins (evidence in
 * docs/scrape-901-request-count.md and the SCRAPE-910 write-up in TASKS.md):
 *
 * - productCount, margin 5%. Catches a Phase B that lost the global top-up
 *   (822 of 7,957 products, a 10.3% drop) or any broken catalog walk.
 *   Normal churn is small: the catalog moved +2.9% NET over the three months
 *   May-August 2026, so a 5% one-month DROP (~400 products) is far outside
 *   anything Geiger's normal discontinuations produce.
 *
 * - pagesWithProducts (baked category JSONs with at least one SKU resolvable
 *   against the catalog), margin 2%. Independent of the count metric: a
 *   stale-taxonomy fallback that loses one renamed department could empty
 *   many facet pages while total products drop stays under 5%. Losing the
 *   822 top-up SKUs empties only 37 of 14,413 product-bearing pages (0.26%),
 *   so this metric is NOT the catcher for that failure (productCount is);
 *   2% (~288 pages) guards the collapse modes while tolerating the handful
 *   of legitimate page-empties a real discontinuation month can cause.
 *
 * - facetUrlsWithProducts (facet-memberships.json entries with a non-empty
 *   SKU list), margin 5%. Catches a Phase C that ran without the brand +
 *   search recovery passes: those supply ~3,434 of the 13,968 non-empty
 *   URLs, a 24.6% drop, five times the margin.
 *
 * A metric whose baseline is missing or zero passes with a note: there is
 * nothing to lose, and failing a first-ever run would be wrong.
 */

export interface RebuildMetrics {
  /** Unique SKUs in data/geiger/products.json. */
  productCount: number;
  /** Baked category JSONs with >= 1 SKU resolvable against the catalog. */
  pagesWithProducts: number;
  /** facet-memberships.json URLs with a non-empty SKU list. */
  facetUrlsWithProducts: number;
}

export interface GuardMargins {
  productDropPct: number;
  pagesDropPct: number;
  facetDropPct: number;
}

export const DEFAULT_MARGINS: GuardMargins = {
  productDropPct: 5,
  pagesDropPct: 2,
  facetDropPct: 5,
};

export interface GuardFinding {
  metric: keyof RebuildMetrics;
  label: string;
  baseline: number | null;
  fresh: number;
  /** Positive = shrank. Null when the baseline is missing/zero. */
  dropPct: number | null;
  allowedPct: number;
  failed: boolean;
  message: string;
}

export interface GuardResult {
  ok: boolean;
  findings: GuardFinding[];
}

const LABELS: Record<keyof RebuildMetrics, string> = {
  productCount: 'Products in the catalog',
  pagesWithProducts: 'Category pages carrying products',
  facetUrlsWithProducts: 'Facet URLs with products',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function evaluateMetric(
  metric: keyof RebuildMetrics,
  baseline: number | null,
  fresh: number,
  allowedPct: number
): GuardFinding {
  const label = LABELS[metric];
  if (baseline == null || baseline <= 0) {
    return {
      metric,
      label,
      baseline,
      fresh,
      dropPct: null,
      allowedPct,
      failed: false,
      message: `${label}: no committed baseline to compare against (fresh: ${fresh}). Passing; nothing to lose.`,
    };
  }
  const dropPct = round2(((baseline - fresh) / baseline) * 100);
  const failed = dropPct > allowedPct;
  const direction =
    fresh >= baseline
      ? `${label}: ${baseline} committed, ${fresh} fresh. No loss.`
      : `${label}: ${baseline} committed, ${fresh} fresh, a ${dropPct}% drop (allowed: ${allowedPct}%).`;
  return {
    metric,
    label,
    baseline,
    fresh,
    dropPct,
    allowedPct,
    failed,
    message: failed
      ? `${direction} This is past the margin, so the rebuild is refusing to open a PR. ` +
        `A drop this size means data was lost, not that Geiger discontinued products.`
      : direction,
  };
}

/**
 * Compare fresh rebuild output against the committed baseline.
 * `baseline` fields may be null when the committed file could not be read
 * (first-ever run); those metrics pass with a note.
 */
export function evaluateRebuild(
  baseline: { [K in keyof RebuildMetrics]: number | null },
  fresh: RebuildMetrics,
  margins: GuardMargins = DEFAULT_MARGINS
): GuardResult {
  const findings: GuardFinding[] = [
    evaluateMetric('productCount', baseline.productCount, fresh.productCount, margins.productDropPct),
    evaluateMetric('pagesWithProducts', baseline.pagesWithProducts, fresh.pagesWithProducts, margins.pagesDropPct),
    evaluateMetric(
      'facetUrlsWithProducts',
      baseline.facetUrlsWithProducts,
      fresh.facetUrlsWithProducts,
      margins.facetDropPct
    ),
  ];
  return { ok: findings.every((f) => !f.failed), findings };
}

/** Unique non-empty SKUs from a parsed products.json payload. */
export function productSkuSet(parsed: unknown): Set<string> {
  const set = new Set<string>();
  const products = (parsed as { products?: { sku?: unknown }[] } | null)?.products;
  for (const p of products ?? []) {
    const sku = String(p?.sku ?? '').trim();
    if (sku) set.add(sku);
  }
  return set;
}

/** Count of facet-memberships URLs with a non-empty SKU list. */
export function countFacetUrlsWithProducts(parsed: unknown): number {
  const memberships = (parsed as { memberships?: Record<string, unknown[]> } | null)?.memberships;
  if (!memberships) return 0;
  let count = 0;
  for (const skus of Object.values(memberships)) {
    if (Array.isArray(skus) && skus.length > 0) count += 1;
  }
  return count;
}

/** Does a baked category doc resolve at least one SKU against the catalog? */
export function pageHasResolvableSku(doc: { productSkus?: unknown[] }, catalog: Set<string>): boolean {
  for (const raw of doc.productSkus ?? []) {
    const sku = String(raw ?? '').trim();
    if (sku && catalog.has(sku)) return true;
  }
  return false;
}

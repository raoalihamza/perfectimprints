// Site Refresh workflow registry (shared between the Studio panel and the
// /api/sanity/workflows route). Pure data — no server-only imports — so it is
// safe to bundle into the Studio client. Each entry maps a stable `key` to the
// GitHub Actions workflow file it dispatches and the PR branch that run opens
// (needed so Cancel can close the PR + delete the branch and leave `main`
// untouched). See CLAUDE.md "Site Refresh" + .github/workflows/.

export interface RefreshWorkflow {
  /** Stable id used by the API + UI. */
  key: string;
  /** Workflow file under .github/workflows/. */
  file: string;
  /**
   * PR branch the run opens (for Cancel cleanup). Omitted for workflows that
   * never open a PR (e.g. the warmup — Cancel just stops the run).
   */
  branch?: string;
  /** Button label shown in the Studio panel. */
  label: string;
  /** Plain-language helper text for Patrick (non-technical). */
  description: string;
  /** Rough run-time estimate, shown under the button. */
  duration: string;
  /** Optional inputs sent with workflow_dispatch (monthly phases / warm scope). */
  inputs?: Record<string, string>;
  /** The heavy monthly full-catalog rebuild — styled + warned differently. */
  heavy?: boolean;
  /**
   * When set, the panel shows this plain-language confirm dialog BEFORE
   * triggering; the run only starts if the user confirms (cost warning).
   */
  confirmMessage?: string;
}

export const REFRESH_WORKFLOWS: RefreshWorkflow[] = [
  {
    key: 'new-products',
    file: 'scrape-new-products.yml',
    branch: 'chore/weekly-new-products-refresh',
    label: 'Refresh New Products',
    description:
      'Pulls the latest "New Products" list from Geiger and updates the New Products page. This no longer runs automatically — press this button whenever you want fresh data.',
    duration: 'about 1–2 minutes',
  },
  {
    key: 'deals',
    file: 'scrape-deals.yml',
    branch: 'chore/weekly-deals-refresh',
    label: 'Refresh Deals',
    description:
      'Pulls the latest sale & closeout deals from Geiger and updates the Deals page. This no longer runs automatically — press this button whenever you want fresh data.',
    duration: 'about 1–2 minutes',
  },
  {
    key: 'rush-products',
    file: 'scrape-rush-products.yml',
    branch: 'chore/weekly-rush-refresh',
    label: 'Refresh Rush Products',
    description:
      "Pulls Geiger's 24-hour Rush Products list and updates the Rush Products page. This no longer runs automatically — press this button whenever you want fresh data.",
    duration: 'about 1–2 minutes',
  },
  {
    key: 'monthly-rebuild',
    file: 'monthly-rebuild.yml',
    branch: 'monthly-rebuild',
    label: 'Full Catalog Rebuild',
    description:
      'The big one: re-scrapes the entire Geiger catalog (22,000+ category pages, all products, all brand logos) and refreshes everything across the site. Use it occasionally (about once a month). It can take a few hours, and the site re-warms itself automatically once it finishes.',
    duration: 'can take several hours',
    inputs: { phases: 'A,B,C,E' },
    heavy: true,
  },
  {
    key: 'warm-all',
    file: 'post-deploy-warmup.yml',
    // No `branch` — the warmup never opens a PR; Cancel just stops the crawl
    // (pages already warmed stay warm, nothing on the site changes).
    label: 'Warm All Pages',
    description:
      'Visits every category page on the live site (22,000+ pages) so each one loads fast for the first visitor. Optional — pages warm themselves the first time someone visits anyway. Most useful right after a Full Catalog Rebuild or another big content change.',
    duration: 'about 15–30 minutes',
    // ALWAYS production + the full set — that's this button's whole purpose.
    // The automatic monthly warmup calls the same workflow WITHOUT warm_scope,
    // so it keeps the default 'smart' capped list.
    inputs: { site_url: 'https://www.perfectimprints.com', warm_scope: 'all' },
    confirmMessage:
      'This warms all 22,000+ pages on the live site and can increase your hosting cost. It is only needed occasionally — for example after a Full Catalog Rebuild. Continue?',
  },
];

export const REFRESH_WORKFLOW_KEYS = REFRESH_WORKFLOWS.map((w) => w.key);

export function getRefreshWorkflow(key: string): RefreshWorkflow | undefined {
  return REFRESH_WORKFLOWS.find((w) => w.key === key);
}

/** Friendly status reported by the API for a workflow's latest run. */
export type RefreshRunState =
  | 'idle' // never run / no recent run
  | 'queued' // dispatched, waiting for a runner
  | 'running' // in progress
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface RefreshStatus {
  key: string;
  state: RefreshRunState;
  /** GitHub run id (present once a run exists; needed to Cancel). */
  runId: number | null;
  /** Link to the run on GitHub, if any. */
  htmlUrl: string | null;
  /** ISO timestamps from GitHub, if any. */
  startedAt: string | null;
  updatedAt: string | null;
}

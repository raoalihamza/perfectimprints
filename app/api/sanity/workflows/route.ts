// Site Refresh workflows API (2026-06-30). Lets the Sanity Studio "Site Refresh"
// panel TRIGGER, read STATUS of, and CANCEL the data-refresh GitHub Actions
// workflows (weekly deals/new/rush + the monthly full-catalog rebuild).
//
//   GET  /api/sanity/workflows                 → status of all workflows
//   GET  /api/sanity/workflows?workflow=<key>  → status of one workflow
//   POST /api/sanity/workflows  { action:'trigger', workflow:<key> }
//   POST /api/sanity/workflows  { action:'cancel',  workflow:<key>, runId:<id> }
//
// AUTH: every call must carry the caller's Sanity Studio session token as
// `Authorization: Bearer <token>`. The route validates it against the project's
// `users/me` endpoint, so only a logged-in Studio user (with access to THIS
// project) can dispatch/cancel. Triggering a full 22K rebuild is expensive, so
// this gate is non-negotiable.
//
// The GitHub fine-grained PAT (GITHUB_WORKFLOW_TOKEN) stays SERVER-SIDE only —
// it is never returned to the browser. Repo is configurable via
// GITHUB_REPO_OWNER / GITHUB_REPO_NAME (default: the production repo) so staging
// can point at the test repo.
//
// No render surface, no Sanity webhook change — this route only talks to GitHub.

import { NextResponse } from 'next/server';
import {
  getRefreshWorkflow,
  REFRESH_WORKFLOWS,
  type RefreshRunState,
  type RefreshStatus,
  type RefreshWorkflow,
} from '@/lib/site-refresh/workflows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GH_API = 'https://api.github.com';
const DISPATCH_REF = 'main';

// ── Config ───────────────────────────────────────────────────────────────────

function getRepo(): { owner: string; name: string } {
  return {
    owner: process.env.GITHUB_REPO_OWNER || 'pbnj53',
    name: process.env.GITHUB_REPO_NAME || 'perfectimprints',
  };
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'perfectimprints-site-refresh',
  };
}

// ── Auth: validate the caller's Sanity Studio session token ──────────────────

async function isAuthorizedStudioUser(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return false;

  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  if (!projectId) return false;

  try {
    // Project-scoped users/me: 200 with a user `id` only when the token is a
    // valid session for a user with access to THIS Sanity project.
    const res = await fetch(`https://${projectId}.api.sanity.io/v2021-06-07/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const user = (await res.json()) as { id?: string } | null;
    return Boolean(user && typeof user.id === 'string' && user.id.length > 0);
  } catch {
    return false;
  }
}

// ── GitHub helpers ───────────────────────────────────────────────────────────

interface GhRun {
  id: number;
  status: string | null; // queued | in_progress | completed | waiting | ...
  conclusion: string | null; // success | failure | cancelled | ...
  html_url: string;
  run_started_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function toState(run: GhRun | null): RefreshRunState {
  if (!run) return 'idle';
  if (run.status === 'completed') {
    switch (run.conclusion) {
      case 'success':
        return 'success';
      case 'cancelled':
        return 'cancelled';
      case 'failure':
      case 'timed_out':
      case 'startup_failure':
        return 'failed';
      default:
        return 'unknown';
    }
  }
  if (run.status === 'in_progress') return 'running';
  if (run.status === 'queued' || run.status === 'waiting' || run.status === 'pending') {
    return 'queued';
  }
  return 'unknown';
}

async function fetchLatestStatus(
  token: string,
  wf: RefreshWorkflow,
): Promise<RefreshStatus> {
  const { owner, name } = getRepo();
  const url = `${GH_API}/repos/${owner}/${name}/actions/workflows/${wf.file}/runs?per_page=1`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token), cache: 'no-store' });
    if (!res.ok) {
      return { key: wf.key, state: 'unknown', runId: null, htmlUrl: null, startedAt: null, updatedAt: null };
    }
    const data = (await res.json()) as { workflow_runs?: GhRun[] };
    const run = data.workflow_runs?.[0] ?? null;
    return {
      key: wf.key,
      state: toState(run),
      runId: run?.id ?? null,
      htmlUrl: run?.html_url ?? null,
      startedAt: run?.run_started_at ?? run?.created_at ?? null,
      updatedAt: run?.updated_at ?? null,
    };
  } catch {
    return { key: wf.key, state: 'unknown', runId: null, htmlUrl: null, startedAt: null, updatedAt: null };
  }
}

async function getRun(token: string, runId: number): Promise<GhRun | null> {
  const { owner, name } = getRepo();
  const res = await fetch(`${GH_API}/repos/${owner}/${name}/actions/runs/${runId}`, {
    headers: ghHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as GhRun;
}

/**
 * Cancel cleanup: close any open PR opened by the run's branch and delete the
 * branch, so a cancelled run can never later merge to `main`. Best-effort — a
 * missing PR/branch (404) is fine. Returns the PR numbers it closed.
 */
async function cleanupBranchAndPr(token: string, branch: string): Promise<number[]> {
  const { owner, name } = getRepo();
  const closed: number[] = [];

  // Close open PRs from this head branch.
  try {
    const res = await fetch(
      `${GH_API}/repos/${owner}/${name}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
      { headers: ghHeaders(token), cache: 'no-store' },
    );
    if (res.ok) {
      const prs = (await res.json()) as { number: number }[];
      for (const pr of prs) {
        const patch = await fetch(`${GH_API}/repos/${owner}/${name}/pulls/${pr.number}`, {
          method: 'PATCH',
          headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'closed' }),
        });
        if (patch.ok) closed.push(pr.number);
      }
    }
  } catch {
    // ignore — best effort
  }

  // Delete the working branch (ignore 404/422 if it never existed / already gone).
  try {
    await fetch(`${GH_API}/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'DELETE',
      headers: ghHeaders(token),
    });
  } catch {
    // ignore
  }

  return closed;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function pat(): string | null {
  const t = process.env.GITHUB_WORKFLOW_TOKEN;
  return t && t.length > 0 ? t : null;
}

export async function GET(request: Request) {
  if (!(await isAuthorizedStudioUser(request))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const token = pat();
  if (!token) {
    return NextResponse.json(
      { error: 'GITHUB_WORKFLOW_TOKEN is not configured on the server.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const one = searchParams.get('workflow');

  if (one) {
    const wf = getRefreshWorkflow(one);
    if (!wf) return NextResponse.json({ error: `Unknown workflow "${one}".` }, { status: 400 });
    return NextResponse.json({ statuses: [await fetchLatestStatus(token, wf)] });
  }

  const statuses = await Promise.all(REFRESH_WORKFLOWS.map((wf) => fetchLatestStatus(token, wf)));
  return NextResponse.json({ statuses });
}

interface PostBody {
  action?: 'trigger' | 'cancel';
  workflow?: string;
  runId?: number;
}

export async function POST(request: Request) {
  if (!(await isAuthorizedStudioUser(request))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const token = pat();
  if (!token) {
    return NextResponse.json(
      { error: 'GITHUB_WORKFLOW_TOKEN is not configured on the server.' },
      { status: 500 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const wf = getRefreshWorkflow(body.workflow || '');
  if (!wf) {
    return NextResponse.json({ error: `Unknown workflow "${body.workflow ?? ''}".` }, { status: 400 });
  }
  const { owner, name } = getRepo();

  // ── Trigger ────────────────────────────────────────────────────────────────
  if (body.action === 'trigger') {
    const res = await fetch(
      `${GH_API}/repos/${owner}/${name}/actions/workflows/${wf.file}/dispatches`,
      {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: DISPATCH_REF, ...(wf.inputs ? { inputs: wf.inputs } : {}) }),
      },
    );
    if (res.status === 204) {
      return NextResponse.json({ triggered: true, workflow: wf.key });
    }
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `Could not start the workflow (GitHub ${res.status}).`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  // ── Cancel (full revoke) ─────────────────────────────────────────────────────
  if (body.action === 'cancel') {
    if (typeof body.runId !== 'number') {
      return NextResponse.json({ error: 'A runId is required to cancel.' }, { status: 400 });
    }

    // If the run already finished, be honest — we can't "revoke" a completed run.
    const run = await getRun(token, body.runId);
    if (run && run.status === 'completed') {
      return NextResponse.json({
        cancelled: false,
        alreadyCompleted: true,
        conclusion: run.conclusion,
        workflow: wf.key,
      });
    }

    // Cancel the in-progress run. The merge-to-main is the workflow's FINAL step,
    // so cancelling before it means main was never touched.
    const cancelRes = await fetch(
      `${GH_API}/repos/${owner}/${name}/actions/runs/${body.runId}/cancel`,
      { method: 'POST', headers: ghHeaders(token) },
    );
    // 202 = accepted; 409 = already completing/cancelled — both fine to clean up.
    if (cancelRes.status !== 202 && cancelRes.status !== 409) {
      const detail = await cancelRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Could not cancel the run (GitHub ${cancelRes.status}).`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    // Belt-and-suspenders: close any PR the run opened and delete its branch so
    // nothing dangling can merge later.
    const closedPrs = await cleanupBranchAndPr(token, wf.branch);

    return NextResponse.json({ cancelled: true, workflow: wf.key, closedPrs });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

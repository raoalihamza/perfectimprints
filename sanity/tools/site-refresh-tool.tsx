/**
 * "Site Refresh" Studio tool (2026-06-30). A dedicated top-level Studio section
 * (registered in sanity.config.ts via `tools`, like "Push to Sanity") that lets
 * Patrick run the data-refresh GitHub Actions workflows on demand, watch their
 * status, and cancel a run.
 *
 *   • Refresh New Products / Deals / Rush Products → the on-demand scrapes
 *     (their Sunday crons were disabled 2026-07 — these buttons are now the
 *     ONLY way they run, besides a manual GitHub dispatch)
 *   • Full Catalog Rebuild → the heavy monthly 22K-page rebuild
 *   • Warm All Pages → force-warms every category page on production via the
 *     existing warmup engine (post-deploy-warmup.yml, warm_scope=all). Costs
 *     real resources, so it's gated behind a plain-language confirm dialog
 *     (RefreshWorkflow.confirmMessage).
 *
 * Each refresh, on success, auto-merges its own PR (the change goes live without
 * touching GitHub). Cancel cancels the run AND closes its PR + deletes its branch
 * so NOTHING reaches `main` ("Cancelled — no changes applied").
 *
 * The panel calls /api/sanity/workflows. It sends the logged-in user's Sanity
 * session token so the route can verify the caller is a real Studio user; the
 * GitHub token never reaches the browser. Studio-only: plain React + the `sanity`
 * client, no @sanity/ui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient, useCurrentUser, type Tool } from 'sanity';
import {
  REFRESH_WORKFLOWS,
  type RefreshRunState,
  type RefreshStatus,
} from '../../lib/site-refresh/workflows';

// Sanity Studio (@sanity/ui) exposes theme CSS variables that flip with
// light/dark mode. Use them for foreground/muted/border so the panel is readable
// in BOTH themes (fallbacks keep it sane if a variable is ever missing).
const FG = 'var(--card-fg-color, #1a1a1a)';
const MUTED = 'var(--card-muted-fg-color, #6b7280)';
const BORDER = 'var(--card-border-color, #ced2d9)';

const card: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  color: FG,
};

const wfBox: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const runBtn: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const heavyBtn: React.CSSProperties = {
  ...runBtn,
  background: '#e11f1e',
};

const cancelBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #e11f1e',
  color: '#e11f1e',
  borderRadius: 4,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const disabledBtn: React.CSSProperties = {
  ...runBtn,
  background: '#9ca3af',
  cursor: 'default',
};

interface StatusLabel {
  text: string;
  color: string;
}

function statusLabel(state: RefreshRunState, justCancelled: boolean): StatusLabel {
  // Amber/green/red read fine on both light + dark; greys use the theme muted var.
  if (justCancelled) return { text: 'Cancelled — no changes applied.', color: MUTED };
  switch (state) {
    case 'queued':
      return { text: 'Queued — waiting to start…', color: '#d97706' };
    case 'running':
      return { text: 'Running…', color: '#d97706' };
    case 'success':
      return { text: 'Last run: finished successfully ✓', color: '#22c55e' };
    case 'failed':
      return { text: 'Last run: failed ✕', color: '#ef4444' };
    case 'cancelled':
      return { text: 'Last run: cancelled — no changes applied.', color: MUTED };
    case 'unknown':
      return { text: 'Status unavailable.', color: MUTED };
    case 'idle':
    default:
      return { text: 'Idle — not run recently.', color: MUTED };
  }
}

function isActive(state: RefreshRunState): boolean {
  return state === 'queued' || state === 'running';
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

// Handshake doc id (a DRAFT so anonymous/public dataset reads can't see it — see
// the auth note below). Must match AUTH_DOC_ID in app/api/sanity/workflows/route.ts.
const AUTH_DOC_ID = 'drafts.siteRefreshAuth';

function newNonce(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '');
  // Fallback (older browsers): still high-entropy enough for a session nonce.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function SiteRefreshComponent() {
  const client = useClient({ apiVersion: '2024-10-01' });
  const currentUser = useCurrentUser();

  const [statuses, setStatuses] = useState<Record<string, RefreshStatus>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [justCancelled, setJustCancelled] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const nonceRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth handshake (cookie-session-safe) ─────────────────────────────────────
  // This Studio authenticates by COOKIE (no JS-accessible session token), so the
  // route can't validate a bearer token. Instead we mirror the proven "Push to
  // Sanity" pattern: perform a cookie-authed Sanity WRITE (only a logged-in user
  // with dataset-write grants can do it) and let the server verify that write.
  // We write a random nonce to a DRAFT doc (drafts.siteRefreshAuth) — drafts are
  // NOT returned by anonymous/public dataset reads, so an unauthenticated caller
  // can neither create the doc nor read the nonce. The route reads the nonce with
  // its own SANITY_API_TOKEN and compares; every privileged call carries the
  // nonce in a header. The GitHub PAT stays server-only.
  const handshake = useCallback(async (): Promise<string | null> => {
    try {
      const nonce = newNonce();
      await client.createOrReplace({
        _id: AUTH_DOC_ID,
        _type: 'siteRefreshAuth',
        nonce,
        at: new Date().toISOString(),
      });
      nonceRef.current = nonce;
      setReady(true);
      setAuthError(null);
      return nonce;
    } catch {
      setReady(false);
      setAuthError('Could not confirm your Studio login. Make sure you are signed in, then reload the page.');
      return null;
    }
  }, [client]);

  useEffect(() => {
    void handshake();
  }, [handshake]);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const call = (nonce: string | null) =>
        fetch(input, {
          ...init,
          credentials: 'same-origin',
          headers: {
            ...(init?.headers || {}),
            ...(nonce ? { 'x-refresh-nonce': nonce } : {}),
          },
        });

      let nonce = nonceRef.current ?? (await handshake());
      const res = await call(nonce);
      // A 401 means the session nonce expired or was overwritten (e.g. another
      // Studio tab). Re-handshake once and retry.
      if (res.status === 401) {
        nonce = await handshake();
        if (nonce) return call(nonce);
      }
      return res;
    },
    [handshake],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch('/api/sanity/workflows');
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `Could not load status (${res.status}).`);
      }
      const data = (await res.json()) as { statuses: RefreshStatus[] };
      setStatuses((prev) => {
        const next = { ...prev };
        for (const s of data.statuses) next[s.key] = s;
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load status.');
    } finally {
      setLoaded(true);
    }
  }, [authFetch]);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while any workflow is active.
  const anyActive = useMemo(
    () => Object.values(statuses).some((s) => isActive(s.state)),
    [statuses],
  );
  useEffect(() => {
    if (anyActive && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 6000);
    } else if (!anyActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyActive, refresh]);

  const trigger = useCallback(
    async (key: string) => {
      setBusy((b) => ({ ...b, [key]: true }));
      setJustCancelled((c) => ({ ...c, [key]: false }));
      setError(null);
      try {
        const res = await authFetch('/api/sanity/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'trigger', workflow: key }),
        });
        const data = (await res.json()) as { triggered?: boolean; error?: string };
        if (!res.ok || !data.triggered) throw new Error(data.error || 'Could not start the refresh.');
        // Optimistically show queued and start polling; GitHub takes a moment to
        // surface the new run id.
        setStatuses((prev) => ({
          ...prev,
          [key]: {
            key,
            state: 'queued',
            runId: prev[key]?.runId ?? null,
            htmlUrl: prev[key]?.htmlUrl ?? null,
            startedAt: null,
            updatedAt: null,
          },
        }));
        // Re-poll shortly so the real run id (needed for Cancel) shows up.
        setTimeout(() => void refresh(), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start the refresh.');
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [authFetch, refresh],
  );

  const cancel = useCallback(
    async (key: string) => {
      const runId = statuses[key]?.runId;
      if (typeof runId !== 'number') {
        setError('No active run to cancel yet — wait a few seconds and try again.');
        return;
      }
      setBusy((b) => ({ ...b, [key]: true }));
      setError(null);
      try {
        const res = await authFetch('/api/sanity/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', workflow: key, runId }),
        });
        const data = (await res.json()) as {
          cancelled?: boolean;
          alreadyCompleted?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Could not cancel the run.');
        if (data.alreadyCompleted) {
          setError('That run already finished, so it cannot be cancelled — the change has gone live.');
        } else if (data.cancelled) {
          setJustCancelled((c) => ({ ...c, [key]: true }));
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel the run.');
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [authFetch, refresh, statuses],
  );

  return (
    <div style={card}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0, color: FG }}>Site Refresh</h1>
        <p style={{ color: MUTED, fontSize: 14 }}>
          Update the product data on your site on demand. The refreshes no longer run on an
          automatic schedule — these buttons are how you pull fresh data, whenever you want it.
          When a refresh finds new data it publishes the change for you automatically (no GitHub
          needed). After a refresh finishes, allow <strong>~12–15 minutes</strong> for the site to
          rebuild and show the new data — the rebuild is automatic, so just wait. Press{' '}
          <strong>Cancel</strong> while a refresh is running to stop it safely — when you cancel,
          nothing on your site changes.
        </p>
      </div>

      {authError ? (
        <div style={{ fontSize: 13, color: '#e11f1e' }}>{authError}</div>
      ) : !currentUser ? (
        <div style={{ fontSize: 13, color: '#e11f1e' }}>
          You need to be signed in to the Studio to run a refresh.
        </div>
      ) : !ready ? (
        <div style={{ fontSize: 13, color: MUTED }}>Connecting to your Studio session…</div>
      ) : null}

      {REFRESH_WORKFLOWS.map((wf) => {
        const st = statuses[wf.key];
        const state = st?.state ?? (loaded ? 'idle' : 'unknown');
        const active = isActive(state);
        const label = statusLabel(state, Boolean(justCancelled[wf.key]));
        const isBusy = Boolean(busy[wf.key]);
        const time = formatTime(st?.updatedAt ?? st?.startedAt ?? null);

        return (
          <div key={wf.key} style={wfBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0, color: FG }}>{wf.label}</h2>
              <span style={{ fontSize: 12, color: MUTED }}>{wf.duration}</span>
            </div>
            <p style={{ fontSize: 13, color: FG, margin: 0 }}>{wf.description}</p>

            <div style={{ fontSize: 13, color: label.color, fontWeight: 500 }}>
              {label.text}
              {time && !active && (
                <span style={{ color: MUTED, fontWeight: 400 }}> ({time})</span>
              )}
              {st?.htmlUrl && (
                <>
                  {' '}
                  <a href={st.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                    view details
                  </a>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {active ? (
                <button
                  type="button"
                  onClick={() => void cancel(wf.key)}
                  disabled={isBusy}
                  style={cancelBtn}
                >
                  {isBusy ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Cost-warning gate (e.g. Warm All Pages): the run only
                    // starts if Patrick explicitly confirms.
                    if (wf.confirmMessage && !window.confirm(wf.confirmMessage)) return;
                    void trigger(wf.key);
                  }}
                  disabled={isBusy || !ready}
                  style={isBusy || !ready ? disabledBtn : wf.heavy ? heavyBtn : runBtn}
                >
                  {isBusy ? 'Starting…' : wf.label}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {error && <div style={{ fontSize: 13, color: '#e11f1e' }}>{error}</div>}

      <p style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
        Tip: the Full Catalog Rebuild is the heavy monthly job. It can take a few hours and the site
        re-warms its most-visited pages automatically after it finishes. If you also want every
        single page pre-warmed, press <strong>Warm All Pages</strong> afterwards — it's optional,
        and pages warm themselves on first visit either way.
      </p>
    </div>
  );
}

export const siteRefreshTool: Tool = {
  name: 'site-refresh',
  title: 'Site Refresh',
  component: SiteRefreshComponent,
};

export default siteRefreshTool;

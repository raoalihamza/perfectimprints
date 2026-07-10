/**
 * "Bulk Upload" Studio tool (P2-CP-003). A dedicated top-level Studio section
 * (registered in sanity.config.ts via `tools`, like "Site Refresh") that lets
 * Patrick create/update many Product Pages at once from a CSV or Excel file:
 *
 *   1. Download the sample template (exact column headings + one example row).
 *   2. Fill it in — Title is the only required column; blank cells are skipped.
 *   3. Upload → PREVIEW: a dry-run table of exactly what will be Created vs
 *      Updated vs has errors (nothing is written yet).
 *   4. Apply → the rows import as DRAFT Product Pages (images downloaded into
 *      Sanity), applied in small batches with a progress readout. Patrick then
 *      reviews/edits each draft normally (AI generate, adjust images, …) and
 *      publishes when ready.
 *
 * Auth: the same cookie-session nonce handshake as the Site Refresh panel (its
 * own draft doc + header so the two panels never clobber each other). Studio-
 * only: plain React + the `sanity` client, no @sanity/ui, and NO import of the
 * parser (parsing happens server-side in /api/sanity/bulk-import).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClient, useCurrentUser, type Tool } from 'sanity';

// Theme CSS variables so the panel is readable in light AND dark Studio themes.
const FG = 'var(--card-fg-color, #1a1a1a)';
const MUTED = 'var(--card-muted-fg-color, #6b7280)';
const BORDER = 'var(--card-border-color, #ced2d9)';

const card: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  color: FG,
};

const primaryBtn: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: FG,
  borderRadius: 4,
  padding: '8px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: '#9ca3af',
  cursor: 'default',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: `2px solid ${BORDER}`,
  fontSize: 12,
  color: MUTED,
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: `1px solid ${BORDER}`,
  fontSize: 13,
  verticalAlign: 'top',
};

// Handshake doc id (a DRAFT so anonymous/public dataset reads can't see it) —
// must match AUTH_DOC_ID in app/api/sanity/bulk-import/route.ts.
const AUTH_DOC_ID = 'drafts.bulkImportAuth';
const NONCE_HEADER = 'x-import-nonce';
const API_URL = '/api/sanity/bulk-import';
const TEMPLATE_URL = '/templates/product-pages-template.csv';
const APPLY_BATCH_SIZE = 5;

function newNonce(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

interface PreviewRow {
  row: number;
  title: string;
  slug: string;
  plan: 'create' | 'update' | 'error';
  errors: string[];
  warnings: string[];
}

interface PreviewResponse {
  ok: boolean;
  error?: string;
  fileErrors?: string[];
  unknownColumns?: string[];
  rows?: PreviewRow[];
  counts?: { create: number; update: number; error: number };
}

interface ApplyRowResult {
  row: number;
  title: string;
  slug: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  messages: string[];
}

interface ApplyResponse {
  ok: boolean;
  error?: string;
  results?: ApplyRowResult[];
  summary?: { created: number; updated: number; skipped: number; failed: number };
}

function planLabel(plan: PreviewRow['plan']): { text: string; color: string } {
  switch (plan) {
    case 'create':
      return { text: 'Will CREATE', color: '#16a34a' };
    case 'update':
      return { text: 'Will UPDATE', color: '#d97706' };
    default:
      return { text: 'ERROR — will be skipped', color: '#ef4444' };
  }
}

function statusLabel(status: ApplyRowResult['status']): { text: string; color: string } {
  switch (status) {
    case 'created':
      return { text: 'Created ✓', color: '#16a34a' };
    case 'updated':
      return { text: 'Updated ✓', color: '#16a34a' };
    case 'failed':
      return { text: 'Failed ✕', color: '#ef4444' };
    default:
      return { text: 'Skipped', color: MUTED };
  }
}

function BulkImportComponent() {
  const client = useClient({ apiVersion: '2024-10-01' });
  const currentUser = useCurrentUser();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [results, setResults] = useState<ApplyRowResult[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const nonceRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Auth handshake (cookie-session-safe, same pattern as Site Refresh) ──────
  const handshake = useCallback(async (): Promise<string | null> => {
    try {
      const nonce = newNonce();
      await client.createOrReplace({
        _id: AUTH_DOC_ID,
        _type: 'bulkImportAuth',
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
    async (body: FormData): Promise<Response> => {
      const call = (nonce: string | null) =>
        fetch(API_URL, {
          method: 'POST',
          credentials: 'same-origin',
          headers: nonce ? { [NONCE_HEADER]: nonce } : {},
          body,
        });
      let nonce = nonceRef.current ?? (await handshake());
      const res = await call(nonce);
      if (res.status === 401) {
        nonce = await handshake();
        if (nonce) return call(nonce);
      }
      return res;
    },
    [handshake],
  );

  const onPickFile = useCallback((f: File | null) => {
    setFile(f);
    setPreview(null);
    setResults(null);
    setError(null);
    setProgress(null);
  }, []);

  // ── Preview (dry run — nothing is written) ──────────────────────────────────
  const runPreview = useCallback(async () => {
    if (!file) return;
    setBusy('preview');
    setError(null);
    setResults(null);
    try {
      const form = new FormData();
      form.set('action', 'preview');
      form.set('file', file);
      const res = await authFetch(form);
      const data = (await res.json().catch(() => ({}))) as PreviewResponse;
      if (!res.ok) throw new Error(data.error || `Could not check the file (${res.status}).`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the file.');
    } finally {
      setBusy(null);
    }
  }, [authFetch, file]);

  // ── Apply (in small batches so each request stays fast) ─────────────────────
  const runApply = useCallback(async () => {
    if (!file || !preview?.rows) return;
    const validRows = preview.rows.filter((r) => r.plan !== 'error').map((r) => r.row);
    if (validRows.length === 0) return;
    if (
      !window.confirm(
        `Import ${validRows.length} product${validRows.length === 1 ? '' : 's'} as draft Product Pages? ` +
          'Nothing goes live — you review and publish each one yourself.',
      )
    ) {
      return;
    }
    setBusy('apply');
    setError(null);
    setResults([]);
    setProgress({ done: 0, total: validRows.length });
    const all: ApplyRowResult[] = [];
    try {
      for (let i = 0; i < validRows.length; i += APPLY_BATCH_SIZE) {
        const batch = validRows.slice(i, i + APPLY_BATCH_SIZE);
        const form = new FormData();
        form.set('action', 'apply');
        form.set('file', file);
        form.set('rows', batch.join(','));
        const res = await authFetch(form);
        const data = (await res.json().catch(() => ({}))) as ApplyResponse;
        if (!res.ok) throw new Error(data.error || `Import stopped (${res.status}).`);
        all.push(...(data.results ?? []));
        setResults([...all]);
        setProgress({ done: Math.min(i + batch.length, validRows.length), total: validRows.length });
      }
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'The import stopped unexpectedly.'} ` +
          `${all.length} row${all.length === 1 ? ' was' : 's were'} processed before it stopped — ` +
          'you can safely upload the same file again; already-imported products just update, they never duplicate.',
      );
    } finally {
      setBusy(null);
    }
  }, [authFetch, file, preview]);

  const validCount = preview?.rows?.filter((r) => r.plan !== 'error').length ?? 0;
  const summary = results
    ? {
        created: results.filter((r) => r.status === 'created').length,
        updated: results.filter((r) => r.status === 'updated').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        failed: results.filter((r) => r.status === 'failed').length,
      }
    : null;

  return (
    <div style={card}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0, color: FG }}>Bulk Upload Product Pages</h1>
        <p style={{ color: MUTED, fontSize: 14 }}>
          Create or update many Product Pages at once from a spreadsheet (.csv or .xlsx, up to 50
          products per file). Start from the{' '}
          <a href={TEMPLATE_URL} download style={{ color: '#3b82f6' }}>
            sample template
          </a>{' '}
          — the column headings must match it exactly. <strong>Title</strong> is the only required
          column; leave any other cell blank to skip that field. Image cells hold picture web
          addresses (URLs); the import downloads each picture into Sanity for you. Everything
          imports as a <strong>draft</strong> — nothing appears on the site until you review and
          publish it. If a product with the same web address (slug) already exists, the import{' '}
          <strong>updates</strong> it instead of creating a duplicate — and only the columns you
          filled in are changed.
        </p>
      </div>

      {authError ? (
        <div style={{ fontSize: 13, color: '#e11f1e' }}>{authError}</div>
      ) : !currentUser ? (
        <div style={{ fontSize: 13, color: '#e11f1e' }}>
          You need to be signed in to the Studio to import products.
        </div>
      ) : !ready ? (
        <div style={{ fontSize: 13, color: MUTED }}>Connecting to your Studio session…</div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          style={{ color: FG, font: 'inherit' }}
        />
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={!file || !ready || busy !== null}
          style={!file || !ready || busy !== null ? disabledBtn : primaryBtn}
        >
          {busy === 'preview' ? 'Checking…' : 'Preview (nothing is saved yet)'}
        </button>
        {file && (
          <button
            type="button"
            onClick={() => {
              onPickFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            disabled={busy !== null}
            style={secondaryBtn}
          >
            Clear
          </button>
        )}
      </div>

      {error && <div style={{ fontSize: 13, color: '#e11f1e' }}>{error}</div>}

      {preview && (preview.fileErrors?.length ?? 0) > 0 && (
        <div style={{ fontSize: 13, color: '#e11f1e' }}>
          {preview.fileErrors!.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      {preview && (preview.unknownColumns?.length ?? 0) > 0 && (
        <div style={{ fontSize: 13, color: '#d97706' }}>
          These column headings were not recognized and will be ignored (check for typos):{' '}
          <strong>{preview.unknownColumns!.join(', ')}</strong>
        </div>
      )}

      {preview?.rows && preview.rows.length > 0 && (
        <div>
          <p style={{ fontSize: 14, color: FG, margin: '0 0 8px' }}>
            <strong>{preview.counts?.create ?? 0}</strong> new,{' '}
            <strong>{preview.counts?.update ?? 0}</strong> will update an existing product,{' '}
            <strong>{preview.counts?.error ?? 0}</strong> with errors (skipped).
          </p>
          <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Row</th>
                  <th style={th}>Title</th>
                  <th style={th}>Web address</th>
                  <th style={th}>What will happen</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const label = planLabel(r.plan);
                  return (
                    <tr key={r.row}>
                      <td style={td}>{r.row}</td>
                      <td style={td}>{r.title || <em style={{ color: MUTED }}>(no title)</em>}</td>
                      <td style={td}>{r.slug ? `/products/${r.slug}` : ''}</td>
                      <td style={{ ...td, color: label.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {label.text}
                      </td>
                      <td style={td}>
                        {r.errors.map((msg, i) => (
                          <div key={`e${i}`} style={{ color: '#ef4444' }}>
                            {msg}
                          </div>
                        ))}
                        {r.warnings.map((msg, i) => (
                          <div key={`w${i}`} style={{ color: '#d97706' }}>
                            {msg}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void runApply()}
              disabled={validCount === 0 || busy !== null}
              style={validCount === 0 || busy !== null ? disabledBtn : primaryBtn}
            >
              {busy === 'apply'
                ? `Importing… ${progress ? `${progress.done} of ${progress.total}` : ''}`
                : `Apply — import ${validCount} product${validCount === 1 ? '' : 's'} as drafts`}
            </button>
            {busy === 'apply' && (
              <span style={{ fontSize: 13, color: MUTED }}>
                Downloading images and saving drafts — keep this tab open…
              </span>
            )}
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, margin: '8px 0', color: FG }}>Import results</h2>
          {summary && busy !== 'apply' && (
            <p style={{ fontSize: 14, color: FG, margin: '0 0 8px' }}>
              <strong>{summary.created}</strong> created, <strong>{summary.updated}</strong>{' '}
              updated, <strong>{summary.skipped}</strong> skipped, <strong>{summary.failed}</strong>{' '}
              failed. Find the drafts under <strong>Product Page</strong> in the content list —
              review each one and press <strong>Publish</strong> when it looks right.
            </p>
          )}
          <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Row</th>
                  <th style={th}>Title</th>
                  <th style={th}>Result</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const label = statusLabel(r.status);
                  return (
                    <tr key={r.row}>
                      <td style={td}>{r.row}</td>
                      <td style={td}>{r.title}</td>
                      <td style={{ ...td, color: label.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {label.text}
                      </td>
                      <td style={td}>
                        {r.messages.map((msg, i) => (
                          <div key={i} style={{ color: '#d97706' }}>
                            {msg}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
        Tip: for products with several colors, use the numbered columns — e.g. “Color 1 Name” +
        “Color 1 Images” (a comma-separated list of picture URLs), “Color 2 Name” + “Color 2
        Images”, and so on. The same numbering pattern covers sizes (“Size 1”, “Size 2”…), pricing
        tiers (“Tier 1 Qty” + “Tier 1 Price”…), decorations (“Decoration 1” + “Decoration 1
        Upcharge”…), and plain images (“Image 1”, “Image 2”…). The full column reference is in your
        Studio guide.
      </p>
    </div>
  );
}

export const bulkImportTool: Tool = {
  name: 'bulk-import',
  title: 'Bulk Upload',
  component: BulkImportComponent,
};

export default bulkImportTool;

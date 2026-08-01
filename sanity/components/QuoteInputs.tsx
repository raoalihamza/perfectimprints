/**
 * Studio inputs for the `quote` document (Q-110 - data foundation):
 *
 *   - `QuoteNumberInput` - displays the assigned quote number, and when the
 *     field is still empty shows one "Assign quote number" button that runs
 *     the concurrency-safe allocator (lib/quotes/numbering.ts) through the
 *     cookie-authed Studio client. Display-only otherwise: there is no text
 *     box, so the number cannot be hand-edited (hand edits would break
 *     uniqueness). A deliberate button (not auto-assign on open) so an
 *     abandoned "create new" pane never burns a sequential number.
 *   - `QuoteTotalsInput` - the read-only computed totals summary. Calls the
 *     SAME pure module every future surface (customer page, PDF, email) will
 *     call, and stores NOTHING (totals are never written to the document).
 *   - `QuoteTokenInput` - the private customer link, as TEXT with copy buttons
 *     and no form control at all, because editing a token would kill a link
 *     already sitting in a customer's inbox.
 *   - `QuoteResponsesInput` - lists this quote's `quoteResponse` records,
 *     newest first, with any artwork the customer attached (Q-150), so Patrick
 *     is not hunting through the response list.
 *
 * Studio-only: plain React + the `sanity` form API (no @sanity/ui), matching
 * ProductPicker/CategoryPicker. The lib imports are pure, dependency-free
 * modules (the site-refresh-tool precedent) - no fs, no server-only.
 */
import { useCallback, useEffect, useState } from 'react';
import { set, useClient, useFormValue, type SlugInputProps, type StringInputProps } from 'sanity';
import {
  QuoteNumberAllocationError,
  allocateQuoteNumber,
} from '../../lib/quotes/numbering';
import { computeQuoteTotals, formatUsd } from '../../lib/quotes/quote-totals';
import { quoteCustomerUrl } from '../../lib/quotes/quote-link';

const API_VERSION = '2024-10-01';

/**
 * The public site origin, for building the customer's quote link. Read with
 * the same both-ways pattern as sanity/env.ts so it resolves in the embedded
 * Studio (Next inlines NEXT_PUBLIC_*) and in the standalone Studio alike.
 * A missing or http value is normalized to https by `quoteCustomerUrl`.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SANITY_STUDIO_SITE_URL ?? '';

const box: React.CSSProperties = {
  border: '1px solid var(--card-border-color, #ced2d9)',
  borderRadius: 4,
  padding: 10,
  background: 'var(--card-bg-color, #fff)',
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 14,
  fontWeight: 600,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--card-muted-fg-color, #6e7683)',
};

const errorText: React.CSSProperties = { fontSize: 12, color: '#b91c1c' };

// ---------------------------------------------------------------------------
// Quote number
// ---------------------------------------------------------------------------
export function QuoteNumberInput(props: StringInputProps) {
  const { onChange } = props;
  const value = typeof props.value === 'string' ? props.value : '';
  const client = useClient({ apiVersion: API_VERSION });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const allocated = await allocateQuoteNumber(client);
      onChange(set(allocated.quoteNumber));
    } catch (err) {
      // Fail loudly: no number was issued, the quote stays unnumbered (and
      // unpublishable), and Patrick retries. Never guess a number here.
      setError(
        err instanceof QuoteNumberAllocationError
          ? err.message
          : 'Could not assign a quote number. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [client, onChange]);

  if (value) {
    return (
      <div style={box}>
        <span style={mono}>{value}</span>
        <div style={muted}>Assigned automatically. Not editable.</div>
      </div>
    );
  }
  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" onClick={assign} disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Assigning...' : 'Assign quote number'}
      </button>
      <div style={muted}>
        Click once to get the next sequential number. Required before the quote can be published.
      </div>
      {error && <div style={errorText}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Private link token (display + copy only; NEVER an editable box)
// ---------------------------------------------------------------------------
/**
 * The token is the customer's private link. Editing it would silently kill a
 * link already sitting in a customer's inbox, so this input renders the value
 * as TEXT with copy buttons and no form control at all. The field also carries
 * `readOnly: true` in the schema; this component removes the text box entirely
 * so there is nothing to type into in the first place.
 *
 * The customer route /quote/<token> does not exist yet (it ships with the
 * customer page), which is why the copy button says so.
 */
function useCopyAction(): [string | null, (text: string, label: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, label: string) => {
    const done = () => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => setCopied('failed'));
      return;
    }
    // Fallback for browsers/contexts without the async clipboard API.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      done();
    } catch {
      setCopied('failed');
    }
  }, []);
  return [copied, copy];
}

export function QuoteTokenInput(props: SlugInputProps) {
  const token = typeof props.value?.current === 'string' ? props.value.current : '';
  const url = quoteCustomerUrl(SITE_URL, token);
  const [copied, copy] = useCopyAction();

  if (!token) {
    return (
      <div style={box}>
        <div style={muted}>
          The private link is created automatically when the quote is created. If nothing appears
          here, create a new quote rather than editing this one.
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...mono, wordBreak: 'break-all' }}>{token}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {url && (
          <button
            type="button"
            onClick={() => copy(url, 'link')}
            style={{ font: 'inherit', fontSize: 12, padding: '4px 10px' }}
          >
            Copy customer link
          </button>
        )}
        <button
          type="button"
          onClick={() => copy(token, 'token')}
          style={{ font: 'inherit', fontSize: 12, padding: '4px 10px' }}
        >
          Copy token only
        </button>
        {copied === 'link' && <span style={{ ...muted, color: '#16a34a' }}>Link copied.</span>}
        {copied === 'token' && <span style={{ ...muted, color: '#16a34a' }}>Token copied.</span>}
        {copied === 'failed' && (
          <span style={errorText}>Could not copy. Select the text above and copy it manually.</span>
        )}
      </div>
      {url && <div style={{ ...muted, wordBreak: 'break-all' }}>{url}</div>}
      <div style={muted}>
        This is the customer&apos;s private link. Copy it and email it to them yourself - there is
        no Send button here. It is created automatically and can never be edited, because changing
        it would break a link you have already sent.
      </div>
      <div style={muted}>
        <strong>The link only works once this quote is PUBLISHED.</strong> While it is still a
        draft, opening it shows a page-not-found - that is deliberate, so an unfinished quote can
        never be seen by a customer.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Computed totals (read-only; stores nothing)
// ---------------------------------------------------------------------------
export function QuoteTotalsInput(_props: StringInputProps) {
  const lineItems = useFormValue(['lineItems']);
  const salesTax = useFormValue(['salesTax']);
  const totals = computeQuoteTotals(lineItems, salesTax);

  const row = (label: string, amount: number, strong = false): React.ReactElement => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: strong ? 700 : 400,
        fontSize: strong ? 15 : 13,
        padding: '2px 0',
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {formatUsd(amount)}
      </span>
    </div>
  );

  return (
    <div style={box}>
      {row('Subtotal', totals.subtotal)}
      {row('Shipping', totals.shippingTotal)}
      {row('Sales tax (as entered above)', totals.salesTax)}
      <div style={{ borderTop: '1px solid var(--card-border-color, #ced2d9)', marginTop: 4 }} />
      {row('Grand total', totals.grandTotal, true)}
      <div style={{ ...muted, marginTop: 6 }}>
        Computed live from the line items. Totals are never stored - every page, PDF, and email
        recalculates from the same formula.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responses list (read-only)
// ---------------------------------------------------------------------------
interface ResponseFile {
  url?: string;
  name?: string;
}

interface ResponseRow {
  _id: string;
  kind?: string;
  createdAt?: string;
  comment?: string;
  files?: ResponseFile[];
}

const KIND_LABELS: Record<string, string> = {
  viewed: 'Link opened',
  accepted: 'Accepted',
  revisionRequested: 'Change requested',
};

/** The colour each kind is worth in a glance. */
const KIND_COLORS: Record<string, string> = {
  accepted: '#16a34a',
  revisionRequested: '#b91c1c',
};

/**
 * This quote's customer responses (Q-150), newest first, with any artwork the
 * customer attached as a direct download.
 *
 * READ ONLY, by design and not just by convention: a quoteResponse is a record
 * of something a customer did, and the schema marks the type and every field
 * readOnly. Patrick reads them here, he does not edit them - which is also why
 * the customer's state can survive his publishing the quote a dozen times.
 */
export function QuoteResponsesInput(_props: StringInputProps) {
  const docId = useFormValue(['_id']);
  const publishedId = typeof docId === 'string' ? docId.replace(/^drafts\./, '') : '';
  const client = useClient({ apiVersion: API_VERSION });
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!publishedId) return;
    try {
      const result = await client.fetch<ResponseRow[]>(
        `*[_type == "quoteResponse" && quote._ref == $id] | order(createdAt desc)[0...50]{
          _id, kind, createdAt, comment,
          "files": files[]{ "url": asset->url, "name": asset->originalFilename }
        }`,
        { id: publishedId },
      );
      setRows(Array.isArray(result) ? result : []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client, publishedId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Customer responses (newest first)</span>
        <button type="button" onClick={load} style={{ fontSize: 12 }}>
          Refresh
        </button>
      </div>
      {failed && <div style={errorText}>Could not load responses. Try Refresh.</div>}
      {!failed && rows !== null && rows.length === 0 && (
        <div style={muted}>
          Nothing yet. When the customer opens their link, accepts the quote, or asks for a change,
          it appears here (and you get an email).
        </div>
      )}
      {!failed &&
        rows !== null &&
        rows.map((r) => {
          const files = (r.files ?? []).filter((f) => f?.url);
          return (
            <div
              key={r._id}
              style={{
                borderTop: '1px solid var(--card-border-color, #e4e8ed)',
                paddingTop: 6,
                fontSize: 13,
              }}
            >
              <strong style={{ color: KIND_COLORS[r.kind ?? ''] }}>
                {KIND_LABELS[r.kind ?? ''] ?? r.kind ?? 'Response'}
              </strong>
              {r.createdAt && (
                <span style={muted}> - {new Date(r.createdAt).toLocaleString('en-US')}</span>
              )}
              {r.comment && <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
              {files.length > 0 && (
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {files.map((f, i) => (
                    <a
                      key={`${r._id}-file-${i}`}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      {f.name || `File ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      <div style={muted}>
        A "Link opened" entry means the quote page was loaded. Automatic email scanners can do that
        too, so treat it as a nudge rather than proof the customer has read it.
      </div>
    </div>
  );
}

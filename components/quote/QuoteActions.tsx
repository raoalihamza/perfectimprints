'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Turnstile } from '@/components/forms/Turnstile';
import {
  ACCEPT_ATTR,
  MAX_FILES,
  MAX_FILE_BYTES,
  formatBytes,
  validateFiles,
} from '@/components/forms/attachment-limits';
import { QUOTE_COMMENT_MAX_CHARS, type CustomerActionKind } from '@/lib/quotes/quote-response';

/**
 * What the customer can DO with their quote (Q-150): accept it, ask for a
 * change, or save a copy. Replaces the reply-by-email note Q-140 left in this
 * slot.
 *
 * STATICNESS - the thing this component must not break
 *
 * /quote/<token> is a statically generated page and has to stay one. This
 * island keeps it that way by construction:
 *
 *   - Every value it needs (the token, the rep's email, whether the quote has
 *     expired, what the customer did last) arrives as a PROP, baked into the
 *     HTML by the server component at render time. Nothing is fetched to draw
 *     the page.
 *   - It never calls `useSearchParams`. That hook forces a client-side-render
 *     bailout during prerender, which silently replaces the whole page body
 *     with the loading skeleton while the build still reports the route as
 *     static - the exact failure documented in CLAUDE.md Section 13 and fixed
 *     for /cat in M-SEO5. The token comes from a prop, not the URL.
 *   - The first client render is identical to the server render, so hydration
 *     matches: the forms start closed and the "what happened" banner is drawn
 *     from the same prop on both sides.
 *
 * The view beacon lives here rather than on the server because a statically
 * served page produces no server invocation when it is opened. There is no way
 * to know a page was viewed without the browser saying so.
 */

export interface QuoteActionsProps {
  /** The private token, from the path. Used only as the request body. */
  token: string;
  /** Already computed on the server, so this component never re-derives it. */
  expired: boolean;
  /** Where to send a customer whose submission fails. */
  repEmail?: string | null;
  repPhone?: string | null;
  quoteNumber?: string | null;
  /** The most recent deliberate action, so a returning visitor sees it too. */
  previousAction?: { kind: CustomerActionKind; when: string | null } | null;
}

type Panel = 'none' | 'accepted' | 'revisionRequested';

const ACTION_COPY: Record<
  CustomerActionKind,
  { done: string; heading: string; blurb: string; button: string; commentLabel: string; placeholder: string }
> = {
  accepted: {
    done: 'You accepted this quote',
    heading: 'Accept this quote',
    blurb:
      'We will confirm artwork and timing with you before anything goes into production. Nothing is charged at this step.',
    button: 'Accept this quote',
    commentLabel: 'Anything we should know? (optional)',
    placeholder: 'Purchase order number, delivery instructions, or anything else about this order.',
  },
  revisionRequested: {
    done: 'You asked us for changes',
    heading: 'Request a change',
    blurb: 'Tell us what you would like different and we will send you an updated quote.',
    button: 'Send my change request',
    commentLabel: 'What would you like changed?',
    placeholder:
      'For example: change the quantity to 500, use the white version of our logo, or split the delivery.',
  },
};

const inputBase =
  'block w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted/60 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';

export function QuoteActions({
  token,
  expired,
  repEmail,
  repPhone,
  quoteNumber,
  previousAction,
}: QuoteActionsProps) {
  const fieldId = useId();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [panel, setPanel] = useState<Panel>('none');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the customer's own submission in THIS session succeeds. */
  const [justDid, setJustDid] = useState<CustomerActionKind | null>(null);

  // ---- The view beacon ---------------------------------------------------
  //
  // Fires ONCE per mount, and a ref guards against React's development
  // double-invoke of effects so a local run does not post twice. The real
  // debounce is not here: refreshing reloads the page, which remounts this and
  // fires again, so the durable "do not record this, do not email this" rule
  // lives in Sanity, checked server-side (lib/quotes/quote-response.ts). A
  // browser-side guard would be defeated by exactly the case it is for.
  const beaconSent = useRef(false);
  useEffect(() => {
    if (beaconSent.current) return;
    beaconSent.current = true;
    const body = new FormData();
    body.set('token', token);
    body.set('kind', 'viewed');
    // keepalive so a customer who opens the quote and immediately navigates
    // away still registers. Failures are ignored on purpose: a missed view
    // notification must never show the customer an error on their own quote.
    void fetch('/api/quote-response', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, [token]);

  function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const fileError = validateFiles(selected);
    if (fileError) {
      setError(fileError);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError(null);
    setFiles(selected);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>, kind: CustomerActionKind) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (kind === 'revisionRequested' && !comment.trim()) {
      setError('Tell us what you would like changed so we can update the quote.');
      return;
    }
    const fileError = validateFiles(files);
    if (fileError) {
      setError(fileError);
      return;
    }

    // Captures the hidden Turnstile token Cloudflare injects into the form.
    const body = new FormData(event.currentTarget);
    body.set('token', token);
    body.set('kind', kind);
    body.set('comment', comment);
    body.set('website', honeypotRef.current?.value ?? '');
    body.delete('files');
    for (const file of files) body.append('files', file);

    setSubmitting(true);
    try {
      const res = await fetch('/api/quote-response', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        // The form stays exactly as the customer left it, so nothing typed is
        // lost and they can simply press the button again.
        setError(data.error ?? 'Something went wrong. Please try again, or email us instead.');
        return;
      }
      setJustDid(kind);
      setPanel('none');
    } catch {
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  /** The browser's own Save as PDF. Q-160 replaces the body of this function. */
  function saveAsPdf() {
    window.print();
  }

  const mailto = repEmail
    ? `mailto:${repEmail}${quoteNumber ? `?subject=${encodeURIComponent(`Quote ${quoteNumber}`)}` : ''}`
    : null;

  // What the customer is told they already did: their action in this session
  // wins, then the stored record so a returning visitor sees it too. A quote
  // can be responded to more than once, so this is a status line and never a
  // lock: the buttons stay available underneath.
  const settled: CustomerActionKind | null = justDid ?? previousAction?.kind ?? null;
  const settledWhen = justDid ? null : previousAction?.when ?? null;

  return (
    <div className="quote-surface quote-actions mt-8 rounded-lg border border-border bg-bg-soft p-5">
      {settled ? (
        <div
          role="status"
          className={
            settled === 'accepted'
              ? 'mb-4 rounded-md border border-brand-green/40 bg-brand-green/10 p-4'
              : 'mb-4 rounded-md border border-brand-red/40 bg-brand-red/5 p-4'
          }
        >
          <p className="text-base font-semibold text-brand-ink">
            {ACTION_COPY[settled].done}
            {settledWhen ? ` on ${settledWhen}` : ''}.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-primary">
            {settled === 'accepted'
              ? 'Thank you. We have let your Perfect Imprints contact know, and they will be in touch to confirm artwork and timing.'
              : 'Thank you. Your Perfect Imprints contact has your notes and will send an updated quote.'}
          </p>
        </div>
      ) : null}

      <h2 className="text-base font-semibold text-brand-ink">
        {settled ? 'Need to do something else?' : 'Ready to go ahead?'}
      </h2>

      {expired ? (
        <p className="mt-1 text-sm leading-relaxed text-text-primary">
          This quote has passed its expiry date, so it cannot be accepted online. Get in touch and we
          will send you an updated quote right away
          {repEmail && mailto ? (
            <>
              {' '}
              at{' '}
              <a href={mailto} className="font-semibold text-brand-red underline hover:no-underline">
                {repEmail}
              </a>
            </>
          ) : null}
          {repPhone ? (
            <>
              {' '}
              or on{' '}
              <a href={`tel:${repPhone}`} className="font-semibold text-brand-red underline hover:no-underline">
                {repPhone}
              </a>
            </>
          ) : null}
          .
        </p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-text-primary">
          Accept the quote, or tell us what you would like changed. We will confirm artwork and
          timing with you before anything goes into production.
        </p>
      )}

      {/* The three controls. Expired quotes show them DISABLED rather than
          hidden, so it is obvious why they cannot be used. */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={expired}
          aria-expanded={panel === 'accepted'}
          onClick={() => setPanel(panel === 'accepted' ? 'none' : 'accepted')}
          className="inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Accept this quote
        </button>
        <button
          type="button"
          disabled={expired}
          aria-expanded={panel === 'revisionRequested'}
          onClick={() => setPanel(panel === 'revisionRequested' ? 'none' : 'revisionRequested')}
          className="inline-flex h-12 items-center justify-center rounded-md border border-brand-ink px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Request a change
        </button>
        {/* Honest label: this is the browser's print dialog, not a file we
            generate. Q-160 swaps the click handler for a real PDF download and
            the button stays exactly where it is. */}
        <button
          type="button"
          onClick={saveAsPdf}
          className="quote-screen-only inline-flex h-12 items-center justify-center rounded-md border border-border px-6 text-base font-semibold text-text-primary transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
        >
          Print or save as PDF
        </button>
      </div>

      {panel !== 'none' && !expired ? (
        <form
          noValidate
          onSubmit={(e) => submit(e, panel)}
          className="mt-5 rounded-md border border-border bg-white p-4 sm:p-5"
        >
          {/* Honeypot - humans never see or fill this. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor={`${fieldId}-website`}>Website</label>
            <input
              ref={honeypotRef}
              id={`${fieldId}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <h3 className="text-base font-semibold text-brand-ink">{ACTION_COPY[panel].heading}</h3>
          <p className="mt-1 text-sm text-text-primary">{ACTION_COPY[panel].blurb}</p>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-semibold text-brand-ink" htmlFor={`${fieldId}-comment`}>
              {ACTION_COPY[panel].commentLabel}
              {panel === 'revisionRequested' ? <span className="text-brand-red"> *</span> : null}
            </label>
            <textarea
              id={`${fieldId}-comment`}
              rows={4}
              value={comment}
              maxLength={QUOTE_COMMENT_MAX_CHARS}
              onChange={(e) => setComment(e.target.value)}
              placeholder={ACTION_COPY[panel].placeholder}
              className={inputBase}
            />
          </div>

          {panel === 'accepted' ? (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-semibold text-brand-ink" htmlFor={`${fieldId}-files`}>
                Attach your artwork <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                id={`${fieldId}-files`}
                name="files"
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                onChange={handleFilesChange}
                className="block w-full cursor-pointer rounded-md border border-border bg-white text-sm text-text-primary file:mr-3 file:cursor-pointer file:border-0 file:bg-bg-soft file:px-3.5 file:py-2.5 file:text-sm file:font-semibold file:text-brand-ink hover:file:bg-border/60 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              />
              <p className="mt-1 text-xs text-text-muted">
                Up to {MAX_FILES} files (PDF, PNG, JPG, GIF, SVG, AI, EPS), max{' '}
                {formatBytes(MAX_FILE_BYTES)} each. No artwork to hand? Accept anyway and we will
                follow up about it.
              </p>
              {files.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="rounded border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-text-primary"
                    >
                      {file.name}{' '}
                      <span className="text-text-muted">({formatBytes(file.size)})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <Turnstile />

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded border border-brand-red/40 bg-brand-red/5 px-3 py-2 text-sm text-brand-red"
            >
              {error}
              {mailto ? (
                <>
                  {' '}
                  You can also email{' '}
                  <a href={mailto} className="font-semibold underline hover:no-underline">
                    {repEmail}
                  </a>
                  .
                </>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={
                panel === 'accepted'
                  ? 'inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white transition-colors hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-60'
                  : 'inline-flex h-12 items-center justify-center rounded-md bg-brand-ink px-6 text-base font-semibold text-white transition-colors hover:bg-brand-ink/90 disabled:cursor-not-allowed disabled:opacity-60'
              }
            >
              {submitting ? 'Sending...' : ACTION_COPY[panel].button}
            </button>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="text-sm font-semibold text-text-muted underline hover:text-brand-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {/* Always available, whatever happens above. */}
      {repEmail && mailto ? (
        <p className="mt-4 text-sm text-text-muted">
          Prefer to reply by email? Write to{' '}
          <a href={mailto} className="font-semibold text-brand-red underline hover:no-underline">
            {repEmail}
          </a>
          {repPhone ? (
            <>
              {' '}
              or call{' '}
              <a href={`tel:${repPhone}`} className="font-semibold text-brand-red underline hover:no-underline">
                {repPhone}
              </a>
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}

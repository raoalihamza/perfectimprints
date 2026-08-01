/**
 * Patrick's notification emails for the three customer actions on a quote
 * (Q-150). PURE: builds `{subject, text, html}` for the existing generic
 * `sendBuiltEmail` in lib/email/gmail-smtp.ts. No transport, no Sanity, no
 * environment reads - so vitest covers the wording offline and the route stays
 * a thin caller (the lib/leads/form-lead.ts + catalog-lead.ts pattern).
 *
 * SUBJECT RULE: the quote number and what happened come FIRST, because these
 * arrive on a phone where a notification preview shows about forty characters.
 * "Quote Q-1007 ACCEPTED - Acme Corp" tells him everything before he unlocks
 * the screen; "New notification from Perfect Imprints" tells him nothing.
 *
 * HONESTY RULE for the opened email: a corporate mail scanner or a link
 * preview bot can fetch the page and run its JavaScript, which looks exactly
 * like a human opening it. The wording therefore says the LINK WAS OPENED and
 * never claims the customer read the quote. See docs/quick-quote.
 */

export interface QuoteNotificationInput {
  /** e.g. "Q-1007". Blank on a quote that was never numbered. */
  quoteNumber?: string | null;
  /** Customer company, else contact name, else their email. */
  customerLabel?: string | null;
  /** Formatted grand total, e.g. "$1,702.13". Computed by the caller. */
  grandTotal?: string | null;
  /** The customer's own link, so Patrick opens exactly what they are seeing. */
  quoteUrl?: string | null;
  /** ISO timestamp of the action. */
  at?: string | null;
  /** The customer's message. Required for a revision request. */
  comment?: string | null;
  /** Filenames the customer attached, if any. */
  attachmentNames?: string[];
  /** True when the artwork was too large to attach and is in Studio only. */
  attachmentsInStudioOnly?: boolean;
  /** Why the view alert fired, for the opened email only. */
  viewNote?: string | null;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function quoteLabel(input: QuoteNotificationInput): string {
  const number = clean(input.quoteNumber);
  return number ? `Quote ${number}` : 'A quote';
}

/** The label/value rows every one of these emails shares. Empty rows dropped. */
function baseRows(input: QuoteNotificationInput): Array<[string, string]> {
  return (
    [
      ['Quote', clean(input.quoteNumber)],
      ['Customer', clean(input.customerLabel)],
      ['Quote total', clean(input.grandTotal)],
      ['When', clean(input.at)],
    ] as Array<[string, string]>
  ).filter((row) => Boolean(row[1]));
}

function renderText(
  headline: string,
  rows: Array<[string, string]>,
  blocks: Array<[string, string]>,
  quoteUrl: string,
): string {
  const pad = (label: string) => `${label}:`.padEnd(14, ' ');
  const lines = [headline, '', ...rows.map(([l, v]) => `${pad(l)}${v}`)];
  for (const [title, body] of blocks) {
    lines.push('', `${title}:`, body);
  }
  if (quoteUrl) lines.push('', `Open the quote: ${quoteUrl}`);
  return lines.join('\n');
}

function renderHtml(
  headline: string,
  accent: string,
  rows: Array<[string, string]>,
  blocks: Array<[string, string]>,
  quoteUrl: string,
): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;width:120px;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');
  const blocksHtml = blocks
    .map(
      ([title, body]) => `
      <div style="margin-top:18px;background:#F5F5F5;border-left:4px solid ${accent};padding:12px 16px;">
        <strong style="display:block;margin-bottom:6px;">${escapeHtml(title)}</strong>
        <div style="white-space:pre-wrap;">${escapeHtml(body)}</div>
      </div>`,
    )
    .join('');
  const linkHtml = quoteUrl
    ? `<p style="margin-top:20px;"><a href="${escapeHtml(quoteUrl)}" style="color:#E11F1E;font-weight:bold;">Open the customer's quote page</a></p>`
    : '';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <h2 style="margin:0 0 14px 0;color:${accent};">${escapeHtml(headline)}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;">
        <tbody>${rowsHtml}</tbody>
      </table>
      ${blocksHtml}
      ${linkHtml}
    </div>
  `;
}

/**
 * "The link was opened." Deliberately the quietest of the three: no comment, no
 * call to action, and wording that does not overclaim (see the honesty rule).
 */
export function buildQuoteViewedEmail(input: QuoteNotificationInput): BuiltEmail {
  const number = clean(input.quoteNumber);
  const customer = clean(input.customerLabel);
  const subject = `${number ? `Quote ${number}` : 'Quote'} opened${customer ? ` - ${customer}` : ''}`;
  const headline = `${quoteLabel(input)} was opened`;
  const blocks: Array<[string, string]> = [
    [
      'What this does and does not tell you',
      'Someone opened the quote link. Automatic email scanners and link previews can also open a link, so treat this as a nudge to follow up rather than proof that the customer has read it.',
    ],
  ];
  const note = clean(input.viewNote);
  if (note) blocks.push(['Note', note]);
  const rows = baseRows(input);
  const url = clean(input.quoteUrl);
  return {
    subject,
    text: renderText(headline, rows, blocks, url),
    html: renderHtml(headline, '#231F20', rows, blocks, url),
  };
}

/** "Accepted." The one that needs acting on fastest. */
export function buildQuoteAcceptedEmail(input: QuoteNotificationInput): BuiltEmail {
  const number = clean(input.quoteNumber);
  const customer = clean(input.customerLabel);
  const total = clean(input.grandTotal);
  const subject = `${number ? `Quote ${number}` : 'Quote'} ACCEPTED${customer ? ` - ${customer}` : ''}${total ? ` (${total})` : ''}`;
  const headline = `${quoteLabel(input)} was accepted`;
  const blocks: Array<[string, string]> = [];
  const comment = clean(input.comment);
  if (comment) blocks.push(['Their message', comment]);
  const names = (input.attachmentNames ?? []).filter((n) => clean(n));
  if (names.length > 0) {
    blocks.push([
      'Artwork attached',
      input.attachmentsInStudioOnly
        ? `${names.join(', ')} (too large to attach to this email - open the response in Studio to download it)`
        : names.join(', '),
    ]);
  } else {
    blocks.push([
      'Artwork',
      'None attached. Follow up with the customer for print-ready artwork before production.',
    ]);
  }
  const rows = baseRows(input);
  const url = clean(input.quoteUrl);
  return {
    subject,
    text: renderText(headline, rows, blocks, url),
    html: renderHtml(headline, '#16A34A', rows, blocks, url),
  };
}

/** "Change requested." The comment is the whole point, so it leads. */
export function buildQuoteRevisionEmail(input: QuoteNotificationInput): BuiltEmail {
  const number = clean(input.quoteNumber);
  const customer = clean(input.customerLabel);
  const subject = `${number ? `Quote ${number}` : 'Quote'} CHANGE REQUESTED${customer ? ` - ${customer}` : ''}`;
  const headline = `${quoteLabel(input)}: the customer asked for changes`;
  const comment = clean(input.comment);
  const blocks: Array<[string, string]> = [
    ['What they want changed', comment || '(no message was recorded)'],
  ];
  const names = (input.attachmentNames ?? []).filter((n) => clean(n));
  if (names.length > 0) {
    blocks.push([
      'Files attached',
      input.attachmentsInStudioOnly
        ? `${names.join(', ')} (too large to attach to this email - open the response in Studio to download it)`
        : names.join(', '),
    ]);
  }
  const rows = baseRows(input);
  const url = clean(input.quoteUrl);
  return {
    subject,
    text: renderText(headline, rows, blocks, url),
    html: renderHtml(headline, '#E11F1E', rows, blocks, url),
  };
}

/** Picks the builder for a kind. Views never reach the two action builders. */
export function buildQuoteNotification(
  kind: 'viewed' | 'accepted' | 'revisionRequested',
  input: QuoteNotificationInput,
): BuiltEmail {
  if (kind === 'accepted') return buildQuoteAcceptedEmail(input);
  if (kind === 'revisionRequested') return buildQuoteRevisionEmail(input);
  return buildQuoteViewedEmail(input);
}

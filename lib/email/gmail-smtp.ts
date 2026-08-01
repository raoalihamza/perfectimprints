import nodemailer, { type Transporter } from 'nodemailer';
import {
  buildCustomerConfirmationEmail,
  type CustomerConfirmationPayload,
} from '@/lib/leads/landing-lead';

export interface LeadEmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface LeadEmailPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /**
   * Optional as of P2-CP-002: product-quote submissions have no "looking for"
   * textarea (the quoted product is the subject). All pre-existing callers
   * keep passing it — an empty value simply skips the row.
   */
  lookingFor?: string;
  quantityNeeded: string;
  dateNeeded: string;
  sourceUrl: string;
  submittedAt: string;
  attachments?: LeadEmailAttachment[];
  /** Product-quote fields (P2-CP-002) — rows are skipped when empty. */
  company?: string;
  shippingZip?: string;
  comments?: string;
  /** SERVER-resolved productPage title — drives the quote subject + Product row. */
  productTitle?: string;
  /** The /products/<slug> slug the quote came from. */
  productSlug?: string;
  /** Configurator selection (P2-CP configurator) — rows skipped when empty. */
  selectedColor?: string;
  selectedSize?: string;
  selectedDecoration?: string;
  /** LABELED ESTIMATE string (e.g. "$748.50"), never presented as firm. */
  estimatedTotal?: string;
  /**
   * Q-150 part 6: set ONLY when a product-quote submission also created a draft
   * quote in Studio, so Patrick knows to go and finish it rather than starting
   * one from scratch. Absent (and therefore invisible) on every other form and
   * on any submission where draft creation was skipped or failed.
   */
  draftQuoteNote?: string;
}

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('Gmail SMTP credentials missing (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The lead-email rows, in display order. Rows with an empty value are skipped,
 * so the pre-existing forms (which never send company/product/zip/comments)
 * produce exactly the same rows as before, while product quotes (which send
 * no "Looking for") show their own set without blank lines.
 */
function buildRows(payload: LeadEmailPayload): Array<[string, string]> {
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  return (
    [
      ['Name', fullName],
      ['Email', payload.email],
      ['Phone', payload.phone],
      ['Company', payload.company?.trim() ?? ''],
      // Configuration block (product quotes) — what exactly is being quoted.
      ['Product', payload.productTitle?.trim() ?? ''],
      ['Color', payload.selectedColor?.trim() ?? ''],
      ['Size', payload.selectedSize?.trim() ?? ''],
      ['Decoration', payload.selectedDecoration?.trim() ?? ''],
      ['Looking for', payload.lookingFor?.trim() ?? ''],
      ['Quantity needed', payload.quantityNeeded],
      ['Date needed', payload.dateNeeded],
      ['Shipping zip', payload.shippingZip?.trim() ?? ''],
      ['Comments', payload.comments?.trim() ?? ''],
      ['Estimated total', payload.estimatedTotal?.trim() ?? ''],
      ['Submitted at', payload.submittedAt],
      ['Draft quote', payload.draftQuoteNote?.trim() ?? ''],
    ] as Array<[string, string]>
  ).filter((row) => Boolean(row[1]));
}

function buildHtml(payload: LeadEmailPayload): string {
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  const sourceUrlSafe = escapeHtml(payload.sourceUrl);
  const headline = payload.productTitle
    ? `Product quote request from ${escapeHtml(fullName)}`
    : `New lead from ${escapeHtml(fullName)}`;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <div style="background:#FFF4F4;border-left:4px solid #E11F1E;padding:12px 16px;margin-bottom:20px;">
        <strong>Source page:</strong><br/>
        <a href="${sourceUrlSafe}" style="color:#E11F1E;font-weight:bold;">${sourceUrlSafe}</a>
      </div>
      <h2 style="margin:0 0 12px 0;color:#231F20;">${headline}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;">
        <tbody>
          ${buildRows(payload)
            .map(
              ([label, value]) => `
              <tr>
                <td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;width:140px;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function buildText(payload: LeadEmailPayload): string {
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  const headline = payload.productTitle
    ? `Product quote request from ${fullName}`
    : `New lead from ${fullName}`;
  const pad = (label: string) => `${label}:`.padEnd(18, ' ');
  return [
    `Source page: ${payload.sourceUrl}`,
    '',
    headline,
    '',
    ...buildRows(payload).map(([label, value]) => `${pad(label)}${value}`),
  ].join('\n');
}

/**
 * Sends the internal lead notification. `opts.to` overrides the destination
 * for landing-page submissions (P2-AI-005 part 2 — the per-page
 * `leadRecipient`, resolved SERVER-SIDE from the landing slug, never from the
 * client); when absent the destination is the site default, exactly as before.
 */
export async function sendLeadEmail(
  payload: LeadEmailPayload,
  opts?: { to?: string },
): Promise<void> {
  const transporter = getTransporter();
  const to = opts?.to || process.env.LEAD_EMAIL_TO || 'patrick@perfectimprints.com';
  const from = process.env.LEAD_EMAIL_FROM || process.env.GMAIL_USER || to;
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  // Product quotes (P2-CP-002) get a subject naming the quoted product so
  // Patrick sees at a glance what the request is for; everything else keeps
  // the pre-existing subject byte-for-byte.
  const subject = payload.productTitle
    ? `Product Quote Request: ${payload.productTitle} — ${fullName}`
    : `New Lead from Perfect Imprints: ${fullName}`;
  await transporter.sendMail({
    from,
    to,
    replyTo: payload.email,
    subject,
    text: buildText(payload),
    html: buildHtml(payload),
    attachments: payload.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
}

/**
 * Sends a pre-built email (subject/text/html from a pure builder — the
 * form-builder lead + confirmation emails in lib/leads/form-lead.ts). Purely
 * additive transport: the pre-existing lead paths keep using sendLeadEmail /
 * sendCustomerConfirmationEmail byte-for-byte.
 */
export async function sendBuiltEmail(input: {
  to: string;
  /** Optional cc — used by the catalog gated-link email (P2-CAT-002) so Patrick sees the link went out. */
  cc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: LeadEmailAttachment[];
}): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.LEAD_EMAIL_FROM || process.env.GMAIL_USER || input.to;
  await transporter.sendMail({
    from,
    to: input.to,
    ...(input.cc ? { cc: input.cc } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
}

/**
 * Customer confirmation for LANDING-PAGE submissions only (P2-AI-005 part 2):
 * a friendly copy of what they sent us, so the lead knows it went through.
 * Body content is built by the pure `buildCustomerConfirmationEmail`
 * (lib/leads/landing-lead.ts, offline-verified); `replyTo` is that landing
 * page's lead recipient so a customer reply lands with the right person.
 * Callers treat a failure here as NON-FATAL — the lead email already sent.
 */
export async function sendCustomerConfirmationEmail(
  input: CustomerConfirmationPayload & {
    /** The customer's (already server-validated) email address. */
    to: string;
    /** The landing recipient (or the site default) — where a reply goes. */
    replyTo: string;
  },
): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.LEAD_EMAIL_FROM || process.env.GMAIL_USER || input.replyTo;
  const { subject, text, html } = buildCustomerConfirmationEmail(input);
  await transporter.sendMail({
    from,
    to: input.to,
    replyTo: input.replyTo,
    subject,
    text,
    html,
  });
}

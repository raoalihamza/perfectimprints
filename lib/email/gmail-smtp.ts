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
  lookingFor: string;
  quantityNeeded: string;
  dateNeeded: string;
  sourceUrl: string;
  submittedAt: string;
  attachments?: LeadEmailAttachment[];
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

function buildHtml(payload: LeadEmailPayload): string {
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  const sourceUrlSafe = escapeHtml(payload.sourceUrl);
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <div style="background:#FFF4F4;border-left:4px solid #E11F1E;padding:12px 16px;margin-bottom:20px;">
        <strong>Source page:</strong><br/>
        <a href="${sourceUrlSafe}" style="color:#E11F1E;font-weight:bold;">${sourceUrlSafe}</a>
      </div>
      <h2 style="margin:0 0 12px 0;color:#231F20;">New lead from ${escapeHtml(fullName)}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;">
        <tbody>
          ${[
            ['Name', fullName],
            ['Email', payload.email],
            ['Phone', payload.phone],
            ['Looking for', payload.lookingFor],
            ['Quantity needed', payload.quantityNeeded],
            ['Date needed', payload.dateNeeded],
            ['Submitted at', payload.submittedAt],
          ]
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
  return [
    `Source page: ${payload.sourceUrl}`,
    '',
    `New lead from ${fullName}`,
    '',
    `Name:             ${fullName}`,
    `Email:            ${payload.email}`,
    `Phone:            ${payload.phone}`,
    `Looking for:      ${payload.lookingFor}`,
    `Quantity needed:  ${payload.quantityNeeded}`,
    `Date needed:      ${payload.dateNeeded}`,
    `Submitted at:     ${payload.submittedAt}`,
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
  await transporter.sendMail({
    from,
    to,
    replyTo: payload.email,
    subject: `New Lead from Perfect Imprints: ${fullName}`,
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

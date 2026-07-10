/**
 * Form-builder lead routing + email content (P2-FB-001).
 *
 * ABUSE GUARD (same design rule as landing/product-quote leads): the client
 * only ever submits a `formSlug`; the recipient is resolved SERVER-SIDE by
 * looking that slug up in Sanity and reading the stored `recipientEmail`.
 * `resolveFormLeadRouting` takes ONLY that stored doc — there is no parameter
 * a client-supplied email could ever reach, so the builder form can never be
 * used as an open relay.
 *
 * Pure module: no fs, no Sanity, no nodemailer, no `server-only` — mirrors
 * lib/leads/landing-lead.ts so it stays offline-verifiable; the actual send
 * goes through `sendBuiltEmail` in lib/email/gmail-smtp.ts.
 */

import { isValidLeadEmail, type BuiltEmail } from './landing-lead';
import type { AnswerRow } from '@/lib/forms/form-def';

/** The slug-resolved `form` doc fields the route reads (all Sanity-stored). */
export interface FormLeadConfig {
  title?: string | null;
  recipientEmail?: string | null;
  sendCustomerConfirmation?: boolean | null;
}

export interface FormLeadRouting {
  /**
   * Explicit lead-email destination, or null = the site default
   * (LEAD_EMAIL_TO / patrick@ — resolved by the caller, exactly like the
   * landing/product-quote paths).
   */
  to: string | null;
  /** Send the customer a confirmation copy (form field, default true). */
  sendConfirmation: boolean;
}

export function resolveFormLeadRouting(form: FormLeadConfig | null | undefined): FormLeadRouting {
  if (!form) return { to: null, sendConfirmation: false };
  const recipient = (form.recipientEmail ?? '').trim();
  return {
    to: isValidLeadEmail(recipient) ? recipient : null,
    // Undefined (older docs / unset boolean) counts as ON — the builder's
    // schema default; only an explicit false turns it off.
    sendConfirmation: form.sendCustomerConfirmation !== false,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pad = (label: string) => `${label}:`.padEnd(18, ' ');

function rowsTable(rows: AnswerRow[]): string {
  return `
      <table style="border-collapse:collapse;width:100%;max-width:560px;">
        <tbody>
          ${rows
            .map(
              ({ label, value }) => `
              <tr>
                <td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;width:180px;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
}

export interface FormLeadEmailInput {
  formTitle: string;
  /** Display name for the subject/headline — falls back to the email. */
  fromName: string;
  /** Definition-ordered label:value rows (empty answers already skipped). */
  answers: AnswerRow[];
  sourceUrl: string;
  submittedAt: string;
}

/**
 * The internal notification for a builder-form submission: subject carries the
 * FORM TITLE so Patrick sees at a glance which form fired, body is a clean
 * label:value block of every (non-empty) answer.
 */
export function buildFormLeadEmail(input: FormLeadEmailInput): BuiltEmail {
  const who = input.fromName.trim() || 'Website visitor';
  const subject = `${input.formTitle}: ${who}`;
  const rows: AnswerRow[] = [
    ...input.answers,
    { label: 'Submitted at', value: input.submittedAt },
  ];

  const text = [
    `Source page: ${input.sourceUrl}`,
    '',
    `${input.formTitle} — submission from ${who}`,
    '',
    ...rows.map(({ label, value }) => `${pad(label)}${value}`),
  ].join('\n');

  const sourceUrlSafe = escapeHtml(input.sourceUrl);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <div style="background:#FFF4F4;border-left:4px solid #E11F1E;padding:12px 16px;margin-bottom:20px;">
        <strong>Source page:</strong><br/>
        <a href="${sourceUrlSafe}" style="color:#E11F1E;font-weight:bold;">${sourceUrlSafe}</a>
      </div>
      <h2 style="margin:0 0 12px 0;color:#231F20;">${escapeHtml(input.formTitle)} — submission from ${escapeHtml(who)}</h2>
      ${rowsTable(rows)}
    </div>
  `;

  return { subject, text, html };
}

export interface FormConfirmationInput {
  firstName: string;
  formTitle: string;
  answers: AnswerRow[];
  sourceUrl: string;
}

/**
 * Friendly customer confirmation summarizing what they sent — the builder-form
 * counterpart to `buildCustomerConfirmationEmail` (landing/product quotes).
 * NON-FATAL at the call site: the lead already reached its recipient.
 */
export function buildFormConfirmationEmail(input: FormConfirmationInput): BuiltEmail {
  const greeting = input.firstName.trim() ? `Hi ${input.firstName.trim()},` : 'Hi,';
  const subject = 'We received your request — Perfect Imprints';

  const text = [
    greeting,
    '',
    `Thanks for your ${input.formTitle} request! It's in — here is a copy of what you sent us:`,
    '',
    ...input.answers.map(({ label, value }) => `${pad(label)}${value}`),
    '',
    'Someone on our team will follow up shortly. Need us sooner? Call 800-773-9472 (9am to 5pm EST).',
    '',
    'Perfect Imprints',
    'https://www.perfectimprints.com',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;max-width:560px;">
      <div style="background:#FFF4F4;border-left:4px solid #E11F1E;padding:12px 16px;margin-bottom:20px;">
        <strong>Your request is in!</strong> Someone on our team will follow up shortly.
      </div>
      <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px 0;">
        Thanks for your ${escapeHtml(input.formTitle)} request! Here is a copy of what you sent us:
      </p>
      ${rowsTable(input.answers)}
      <p style="margin:16px 0 0 0;">
        We will reply shortly. Need us sooner? Call <strong>800-773-9472</strong> (9am to 5pm EST).
      </p>
      <p style="margin:16px 0 0 0;color:#666;">Perfect Imprints · www.perfectimprints.com</p>
    </div>
  `;

  return { subject, text, html };
}

/**
 * Landing-page lead routing + customer-confirmation content (P2-AI-005 part 2).
 *
 * ABUSE GUARD (the key design rule): the client only ever submits a
 * `landingSlug`; the recipient is resolved SERVER-SIDE by looking that slug up
 * in Sanity (`getLandingLeadInfo`) and reading the stored `leadRecipient`.
 * `resolveLandingLeadRouting` takes ONLY that stored doc — there is no
 * parameter a client-supplied email could ever reach, so the lead form can
 * never be used as an open relay.
 *
 * Routing rules:
 *   - slug absent / not a real landing page / lookup failed → the site default
 *     recipient (LEAD_EMAIL_TO / patrick@), NO customer confirmation — i.e. the
 *     pre-existing behavior of every non-landing form, byte-for-byte.
 *   - landing page with a VALID stored `leadRecipient` → that recipient, plus a
 *     customer confirmation email.
 *   - landing page with a blank/invalid `leadRecipient` → the site default
 *     recipient, but it IS still a landing submission → confirmation sent.
 *
 * Pure module: no fs, no Sanity, no nodemailer, no `server-only` — the
 * offline verifier imports it directly; `lib/email/gmail-smtp.ts` reuses the
 * confirmation builder for the actual send.
 */

/** Hard fallback when LEAD_EMAIL_TO is unset (mirrors gmail-smtp.ts). */
export const DEFAULT_LEAD_RECIPIENT = 'patrick@perfectimprints.com';

/** Same shape the /api/leads route uses for the submitter's email. */
export function isValidLeadEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** The slug-resolved landing doc fields the route reads (all Sanity-stored). */
export interface LandingLeadInfo {
  leadRecipient?: string | null;
  /** For the confirmation copy, e.g. "Custom Beach Towels". */
  product?: string | null;
  title?: string | null;
}

export interface LandingLeadRouting {
  /**
   * Explicit lead-email destination, or null = use the site default
   * (LEAD_EMAIL_TO / patrick@ — resolved inside sendLeadEmail, exactly as
   * before this feature existed).
   */
  to: string | null;
  /** True only for a real landing-page submission. */
  sendConfirmation: boolean;
}

/**
 * Decide where the lead email goes and whether the customer gets a
 * confirmation. `landing` is the SERVER-resolved doc for the submitted slug
 * (null when the slug is absent, unknown, or the lookup failed).
 */
export function resolveLandingLeadRouting(
  landing: LandingLeadInfo | null | undefined,
): LandingLeadRouting {
  if (!landing) return { to: null, sendConfirmation: false };
  const recipient = (landing.leadRecipient ?? '').trim();
  return {
    to: isValidLeadEmail(recipient) ? recipient : null,
    sendConfirmation: true,
  };
}

// ---------------------------------------------------------------------------
// Customer confirmation email (landing submissions only)
// ---------------------------------------------------------------------------

export interface CustomerConfirmationPayload {
  firstName: string;
  lookingFor: string;
  quantityNeeded: string;
  dateNeeded: string;
  /** The landing page's product/topic (or its title) — names what they asked about. */
  product?: string;
  sourceUrl: string;
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

/**
 * Friendly confirmation summarizing the submission. Pure so the offline
 * verifier can assert the summary fields are present and HTML-escaped;
 * `sendCustomerConfirmationEmail` (gmail-smtp.ts) does the actual send.
 */
export function buildCustomerConfirmationEmail(payload: CustomerConfirmationPayload): BuiltEmail {
  const topic = payload.product?.trim() || 'custom promotional products';
  const subject = 'We received your request — Perfect Imprints';

  const text = [
    `Hi ${payload.firstName},`,
    '',
    `Thanks for reaching out about ${topic}! Your request is in — here is what you sent us:`,
    '',
    `Looking for:      ${payload.lookingFor}`,
    `Quantity needed:  ${payload.quantityNeeded}`,
    `Date needed:      ${payload.dateNeeded}`,
    `Page:             ${payload.sourceUrl}`,
    '',
    'Someone on our team will follow up shortly with product ideas and pricing tailored to your request. Need us sooner? Call 800-773-9472 (9am to 5pm EST).',
    '',
    'Perfect Imprints',
    'https://www.perfectimprints.com',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;max-width:560px;">
      <div style="background:#FFF4F4;border-left:4px solid #E11F1E;padding:12px 16px;margin-bottom:20px;">
        <strong>Your request is in!</strong> Someone on our team will follow up shortly.
      </div>
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(payload.firstName)},</p>
      <p style="margin:0 0 16px 0;">
        Thanks for reaching out about ${escapeHtml(topic)}! Here is a copy of what you sent us:
      </p>
      <table style="border-collapse:collapse;width:100%;">
        <tbody>
          ${[
            ['Looking for', payload.lookingFor],
            ['Quantity needed', payload.quantityNeeded],
            ['Date needed', payload.dateNeeded],
            ['Page', payload.sourceUrl],
          ]
            .map(
              ([label, value]) => `
              <tr>
                <td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;width:140px;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p style="margin:16px 0 0 0;">
        We will reply with product ideas and pricing tailored to your request. Need us sooner?
        Call <strong>800-773-9472</strong> (9am to 5pm EST).
      </p>
      <p style="margin:16px 0 0 0;color:#666;">Perfect Imprints · www.perfectimprints.com</p>
    </div>
  `;

  return { subject, text, html };
}

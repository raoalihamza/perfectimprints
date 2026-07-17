/**
 * Catalog lead-page delivery content (P2-CAT-002).
 *
 * The /shop-by-theme/<slug> landing pages capture a lead through the seeded
 * `catalog-request` builder form (First/Last/Company/Phone/Email + optional
 * Comments) and, on a valid submission, email the customer the link to that
 * catalog's GATED page (/shop-by-theme/<slug>/catalog) with Patrick cc'd —
 * the "email-gated" delivery: the link only ever reaches a real, working
 * address.
 *
 * ABUSE GUARD (same design rule as landing/product/form leads): the client
 * sends only a `catalogSlug` (via the form's hidden fields); the RECIPIENT of
 * the lead notification is the form doc's stored `recipientEmail`, resolved
 * server-side — no client-supplied address is ever a destination. The slug is
 * validated server-side against a published `catalogPage`
 * (`getCatalogLeadInfo`); an unknown slug degrades to a plain builder-form
 * submission (no catalog email). The gated URL itself is not sensitive (a
 * plain path), so deriving it from the validated slug is fine.
 *
 * Pure module: no fs, no Sanity, no nodemailer, no `server-only` — mirrors
 * lib/leads/landing-lead.ts / form-lead.ts; the actual send goes through
 * `sendBuiltEmail` in lib/email/gmail-smtp.ts.
 */

import type { BuiltEmail } from './landing-lead';

/**
 * The slug of the seeded builder `form` doc every catalog landing CTA opens
 * (`pnpm seed-catalog-form`). Shared by the landing page (which resolves the
 * renderable definition) and anything else that needs to target the form.
 * The /api/leads route does NOT special-case this slug — the catalog behavior
 * keys off the hidden `catalogSlug` field, so the form stays a normal,
 * Patrick-editable builder form.
 */
export const CATALOG_FORM_SLUG = 'catalog-request';

/**
 * Force an https origin from whatever the site-URL env/constant holds.
 * The caller passes the SAME `NEXT_PUBLIC_SITE_URL`-derived base the
 * sitemap/canonicals use, but this link lands in a customer's inbox — a
 * mis-set env var (`http://…` or a bare host with no scheme) must not put an
 * http link in the email, so the scheme is normalized here defensively
 * rather than trusted. Host is untouched (staging stays dev.…, prod www.…).
 */
function httpsOrigin(siteUrl: string): string {
  const base = siteUrl.trim().replace(/\/+$/, '');
  if (!base) return 'https://www.perfectimprints.com';
  return `https://${base.replace(/^https?:\/\//i, '')}`;
}

/** The gated catalog URL for a validated catalogPage slug (server-derived, always https). */
export function gatedCatalogUrl(siteUrl: string, catalogSlug: string): string {
  return `${httpsOrigin(siteUrl)}/shop-by-theme/${catalogSlug}/catalog`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface CatalogConfirmationInput {
  firstName: string;
  /** The catalogPage title, resolved SERVER-SIDE (never client-supplied). */
  catalogTitle: string;
  /** The absolute gated-page URL, e.g. https://www.../shop-by-theme/usa-made/catalog */
  catalogUrl: string;
}

/**
 * The customer email delivering the gated catalog link — THE feature of the
 * catalog lead pages. Sent cc Patrick (the resolved lead recipient) so he sees
 * the link went out to a valid address; NON-FATAL at the call site (the lead
 * notification + record have already happened).
 */
export function buildCatalogConfirmationEmail(input: CatalogConfirmationInput): BuiltEmail {
  const greeting = input.firstName.trim() ? `Hi ${input.firstName.trim()},` : 'Hi,';
  const title = input.catalogTitle.trim() || 'requested';
  const subject = `Your ${title} catalog is ready - Perfect Imprints`;

  const text = [
    greeting,
    '',
    `Thanks for requesting the ${title} catalog! Browse it — and shop every product inside it — right here:`,
    '',
    input.catalogUrl,
    '',
    'When you find something you like, request a quote on that page and our team will get right back to you with pricing and free art proofs.',
    '',
    'Questions sooner? Call 800-773-9472 (9am to 5pm EST).',
    '',
    'Perfect Imprints',
    'https://www.perfectimprints.com',
  ].join('\n');

  const urlSafe = escapeHtml(input.catalogUrl);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;max-width:560px;">
      <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px 0;">
        Thanks for requesting the <strong>${escapeHtml(title)}</strong> catalog!
        Browse it — and shop every product inside it — right here:
      </p>
      <p style="margin:0 0 20px 0;">
        <a href="${urlSafe}"
           style="display:inline-block;background:#16A34A;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:6px;">
          View the ${escapeHtml(title)} Catalog
        </a>
      </p>
      <p style="margin:0 0 16px 0;color:#666;font-size:13px;">
        Or copy this link: <a href="${urlSafe}" style="color:#E11F1E;">${urlSafe}</a>
      </p>
      <p style="margin:0 0 16px 0;">
        When you find something you like, request a quote on that page and our team will get right
        back to you with pricing and free art proofs.
      </p>
      <p style="margin:0 0 16px 0;">
        Questions sooner? Call <strong>800-773-9472</strong> (9am to 5pm EST).
      </p>
      <p style="margin:0;color:#666;">Perfect Imprints · www.perfectimprints.com</p>
    </div>
  `;

  return { subject, text, html };
}

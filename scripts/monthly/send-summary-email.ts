/**
 * Monthly rebuild (M6-606) — email Patrick the change summary.
 *
 *   pnpm tsx scripts/monthly/send-summary-email.ts
 *
 * Reads scripts/monthly/.artifacts/summary.json + pr-body.md (written by
 * compute-summary.ts) and sends a summary email via Gmail SMTP, the same
 * transport the lead form uses (lib/email/gmail-smtp.ts).
 *
 * Env:
 *   GMAIL_USER + GMAIL_APP_PASSWORD   (required — no-ops with a warning if absent)
 *   LEAD_EMAIL_TO / LEAD_EMAIL_FROM   (optional; default patrick@perfectimprints.com)
 *   MONTHLY_PR_URL                    (optional; link to the opened PR)
 */
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');

interface Summary {
  changed: boolean;
  products: { oldCount: number; newCount: number; added: number; removed: number; priceChanged: number };
  brands: { oldCount: number; newCount: number; added: string[]; removed: string[]; logosAddedOrChanged: number };
  categories: { newPages: number; updatedPages: number };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function main(): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping summary email.');
    return;
  }

  const summaryPath = path.join(ARTIFACTS_DIR, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.warn(`No summary.json at ${summaryPath} — nothing to email.`);
    return;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Summary;
  const bodyMd = fs.existsSync(path.join(ARTIFACTS_DIR, 'pr-body.md'))
    ? fs.readFileSync(path.join(ARTIFACTS_DIR, 'pr-body.md'), 'utf8')
    : '';

  const prUrl = process.env.MONTHLY_PR_URL || '';
  const to = process.env.LEAD_EMAIL_TO || 'patrick@perfectimprints.com';
  const from = process.env.LEAD_EMAIL_FROM || user;

  const p = summary.products;
  const b = summary.brands;
  const c = summary.categories;

  const rows: [string, string][] = [
    ['Products (was → now)', `${p.oldCount} → ${p.newCount}`],
    ['Products added', String(p.added)],
    ['Products removed', String(p.removed)],
    ['Price changes', String(p.priceChanged)],
    ['Brands (was → now)', `${b.oldCount} → ${b.newCount}`],
    ['Brands added', b.added.length ? b.added.join(', ') : '0'],
    ['Brand logos added/changed', String(b.logosAddedOrChanged)],
    ['New category pages', String(c.newPages)],
    ['Updated category pages', String(c.updatedPages)],
  ];

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <h2 style="margin:0 0 12px 0;color:#231F20;">Perfect Imprints — monthly catalog rebuild</h2>
      ${prUrl ? `<p style="margin:0 0 16px 0;">Review &amp; merge PR: <a href="${escapeHtml(prUrl)}" style="color:#E11F1E;font-weight:bold;">${escapeHtml(prUrl)}</a></p>` : ''}
      <table style="border-collapse:collapse;width:100%;max-width:560px;">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
              <tr>
                <td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;width:220px;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p style="margin:18px 0 0 0;color:#666;font-size:13px;">On merge, Vercel rebuilds production and the post-deploy warmup re-warms facet pages.</p>
    </div>
  `;

  const text = [
    'Perfect Imprints — monthly catalog rebuild',
    prUrl ? `\nReview & merge PR: ${prUrl}\n` : '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    bodyMd,
  ].join('\n');

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await transporter.sendMail({
    from,
    to,
    subject: `Perfect Imprints monthly rebuild — +${p.added}/-${p.removed} products, ${p.priceChanged} price changes`,
    text,
    html,
  });
  console.log(`Summary email sent to ${to}.`);
}

main().catch((err) => {
  // Non-fatal: a failed email must not fail the whole rebuild.
  console.error(`Failed to send summary email: ${(err as Error).message}`);
  process.exit(0);
});

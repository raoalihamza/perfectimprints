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
 *   MONTHLY_PR_STATUS                 (SCRAPE-930; how the PR came to exist:
 *                                      created | recovered | retried | failed)
 *   MONTHLY_PR_REASON                 (SCRAPE-930; plain reason when failed)
 *   MONTHLY_CHANGED                   (SCRAPE-930; 'true' when a PR was expected)
 *   MONTHLY_EMAIL_DRY_RUN             (tests only; '1' prints subject + text
 *                                      instead of sending anything)
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
  // SCRAPE-910: present when compute-summary.ts found geiger.com fallback
  // status files or the data-loss guard report. Optional so an email for an
  // older summary.json still sends.
  fallbacks?: { any: boolean; notices: string[] };
  guard?: { ok?: boolean } | null;
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
  const dryRun = process.env.MONTHLY_EMAIL_DRY_RUN === '1';
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!dryRun && (!user || !pass)) {
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
  const from = process.env.LEAD_EMAIL_FROM || user || '';

  // SCRAPE-930: how the pull request came to exist, from the workflow's
  // recovery step. 'created' is the normal path. 'recovered'/'retried' mean
  // GitHub's API misbehaved but the run fixed it itself - informational only.
  // 'failed' (or no status at all when a PR was expected) means nothing was
  // merged and Patrick must hear that PLAINLY AND FIRST, before any table of
  // numbers - run #5's lesson, where the failure was invisible until Ali went
  // looking.
  const prStatus = process.env.MONTHLY_PR_STATUS || '';
  const prReason = process.env.MONTHLY_PR_REASON || '';
  const prExpected = process.env.MONTHLY_CHANGED === 'true';
  const prFailed = prExpected && prStatus !== 'created' && prStatus !== 'recovered' && prStatus !== 'retried';
  const prRecoveredNote =
    prStatus === 'recovered'
      ? "GitHub returned an error while creating this month's pull request, but the pull request had been created anyway; the run found it and continued on its own. Nothing for you to do."
      : prStatus === 'retried'
        ? "GitHub returned an error while creating this month's pull request; the run created it on a retry and continued on its own. Nothing for you to do."
        : null;
  const prFailedDetail =
    prReason ||
    'GitHub did not confirm that a pull request was created; check the workflow run for the reason.';

  const p = summary.products;
  const b = summary.brands;
  const c = summary.categories;
  // SCRAPE-910: when part of the refresh fell back to committed data, that
  // is the first thing Patrick reads, before any table of numbers.
  const fallbackNotices = summary.fallbacks?.any ? summary.fallbacks.notices : [];
  const guardLine =
    summary.guard == null
      ? null
      : summary.guard.ok
        ? 'Data-loss guard: passed (nothing was lost against the committed catalog).'
        : 'Data-loss guard: FAILED (this should never reach an email; check the workflow run).';

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

  // SCRAPE-930: the needs-your-attention panel leads the email when no PR
  // could be confirmed; the recovered note is a quiet aside when the run
  // healed itself.
  const prFailedHtml = prFailed
    ? `<div style="border-left:5px solid #E11F1E;background:#FDECEC;padding:12px 16px;margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-weight:bold;color:#E11F1E;">Action needed: the rebuild finished and the data passed every check, but no pull request could be created, so nothing was merged and the site was NOT updated.</p>
        <p style="margin:0 0 6px 0;">${escapeHtml(prFailedDetail)}</p>
        <p style="margin:6px 0 0 0;color:#666;font-size:13px;">No data was lost. Press Full Catalog Rebuild again, or ask Ali to open the pull request by hand.</p>
      </div>`
    : '';
  const prRecoveredHtml = prRecoveredNote
    ? `<p style="border-left:5px solid #F59E0B;background:#FEF3C7;padding:10px 14px;margin:0 0 16px 0;">${escapeHtml(prRecoveredNote)}</p>`
    : '';

  const fallbackHtml = fallbackNotices.length
    ? `<div style="border-left:5px solid #E11F1E;background:#FDECEC;padding:12px 16px;margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-weight:bold;color:#E11F1E;">Incomplete refresh: parts of this rebuild fell back to the previous data.</p>
        ${fallbackNotices.map((n) => `<p style="margin:0 0 6px 0;">${escapeHtml(n)}</p>`).join('')}
        <p style="margin:6px 0 0 0;color:#666;font-size:13px;">Everything already on the site stays correct; only brand-new Geiger additions are missed. A rebuild run from an unblocked machine picks them up.</p>
      </div>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#231F20;">
      <h2 style="margin:0 0 12px 0;color:#231F20;">Perfect Imprints — monthly catalog rebuild</h2>
      ${prFailedHtml}
      ${fallbackHtml}
      ${prUrl ? `<p style="margin:0 0 16px 0;">Review &amp; merge PR: <a href="${escapeHtml(prUrl)}" style="color:#E11F1E;font-weight:bold;">${escapeHtml(prUrl)}</a></p>` : ''}
      ${prRecoveredHtml}
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
      ${guardLine ? `<p style="margin:14px 0 0 0;color:${summary.guard?.ok ? '#16A34A' : '#E11F1E'};font-size:13px;">${escapeHtml(guardLine)}</p>` : ''}
      <p style="margin:18px 0 0 0;color:#666;font-size:13px;">On merge, Vercel rebuilds production and the post-deploy warmup re-warms facet pages.</p>
    </div>
  `;

  const text = [
    'Perfect Imprints — monthly catalog rebuild',
    ...(prFailed
      ? [
          '',
          'ACTION NEEDED: the rebuild finished and the data passed every check, but no pull request could be created, so nothing was merged and the site was NOT updated.',
          prFailedDetail,
          'No data was lost. Press Full Catalog Rebuild again, or ask Ali to open the pull request by hand.',
          '',
        ]
      : []),
    ...(prRecoveredNote ? ['', prRecoveredNote, ''] : []),
    ...(fallbackNotices.length
      ? [
          '',
          'INCOMPLETE REFRESH: parts of this rebuild fell back to the previous data.',
          ...fallbackNotices.map((n) => `- ${n}`),
          '',
        ]
      : []),
    prUrl ? `\nReview & merge PR: ${prUrl}\n` : '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(guardLine ? ['', guardLine] : []),
    '',
    bodyMd,
  ].join('\n');

  const subjectPrefix = prFailed || fallbackNotices.length ? '[Needs attention] ' : '';
  const subject = `${subjectPrefix}Perfect Imprints monthly rebuild - +${p.added}/-${p.removed} products, ${p.priceChanged} price changes`;

  if (dryRun) {
    // SCRAPE-930 test affordance: print what WOULD be sent, send nothing.
    console.log(`DRY RUN SUBJECT: ${subject}`);
    console.log('DRY RUN TEXT:');
    console.log(text);
    return;
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
  console.log(`Summary email sent to ${to}.`);
}

main().catch((err) => {
  // Non-fatal: a failed email must not fail the whole rebuild.
  console.error(`Failed to send summary email: ${(err as Error).message}`);
  process.exit(0);
});

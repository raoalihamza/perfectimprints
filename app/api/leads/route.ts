import { NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import {
  sendBuiltEmail,
  sendCustomerConfirmationEmail,
  sendLeadEmail,
  type LeadEmailAttachment,
  type LeadEmailPayload,
} from '@/lib/email/gmail-smtp';
import { DEFAULT_LEAD_RECIPIENT, resolveLandingLeadRouting } from '@/lib/leads/landing-lead';
import {
  buildFormConfirmationEmail,
  buildFormLeadEmail,
  resolveFormLeadRouting,
} from '@/lib/leads/form-lead';
import {
  buildAnswerRows,
  extractContactFields,
  fieldName,
  validateAnswers,
  type AnswerValue,
} from '@/lib/forms/form-def';
import { buildCatalogConfirmationEmail, gatedCatalogUrl } from '@/lib/leads/catalog-lead';
import { getFormBySlug } from '@/lib/sanity/queries/forms';
import { getLandingLeadInfo } from '@/lib/sanity/queries/landing-pages';
import { getProductLeadInfo } from '@/lib/sanity/queries/product-pages';
import { getCatalogLeadInfo } from '@/lib/sanity/queries/catalog-pages';

export const runtime = 'nodejs';

// Same site-URL constant convention as the sitemap/canonicals — the gated
// catalog link in the customer email is built from this, server-side only.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitStore = new Map<string, number[]>();

// Attachment limits — kept in sync with the client (components/forms/LeadForm.tsx).
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // ~20MB total (under Gmail's 25MB ceiling)
const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ai', '.eps'];

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateLimitStore.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateLimitStore.set(ip, hits);
  return false;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSanityWriteClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
  });
}

// siteverify error codes that mean OUR configuration is broken (wrong/missing
// secret), as opposed to the visitor's token being bad. Config errors must
// never block leads — see the fail-open policy in verifyTurnstile.
const TURNSTILE_CONFIG_ERROR_CODES = new Set(['invalid-input-secret', 'missing-input-secret']);

/**
 * Verifies a Cloudflare Turnstile token against siteverify.
 *
 * Failure-mode policy (leads are revenue — a config mistake must never
 * silently swallow them, but a bot with a bad token must be blocked):
 *
 * - FAIL OPEN (accept the lead, log loudly) on CONFIGURATION errors:
 *   TURNSTILE_SECRET_KEY unset (staging/local without keys — the widget
 *   doesn't render there either), siteverify rejecting OUR secret
 *   (`invalid-input-secret`), siteverify unreachable, or a non-JSON/non-2xx
 *   siteverify response. The honeypot + rate limit remain active regardless.
 * - FAIL CLOSED (reject with 400) on ACTUAL verification failures: no token
 *   submitted while the widget is configured, or siteverify answering
 *   `success: false` for the token (invalid/expired/already-redeemed).
 */
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error(
      '[leads] TURNSTILE MISCONFIGURED: TURNSTILE_SECRET_KEY is not set — CAPTCHA verification SKIPPED (fail open). Set it in Vercel to activate bot protection.'
    );
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) {
      console.error(
        `[leads] TURNSTILE SERVICE ERROR: siteverify returned HTTP ${res.status} — accepting lead (fail open).`
      );
      return true;
    }
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) return true;
    const codes = data['error-codes'] ?? [];
    if (codes.some((code) => TURNSTILE_CONFIG_ERROR_CODES.has(code))) {
      console.error(
        `[leads] TURNSTILE MISCONFIGURED: siteverify rejected our secret (${codes.join(', ')}) — accepting lead (fail open). Fix TURNSTILE_SECRET_KEY in Vercel.`
      );
      return true;
    }
    console.warn(`[leads] turnstile rejected token (${codes.join(', ') || 'no error codes'})`);
    return false;
  } catch (err) {
    console.error(
      '[leads] TURNSTILE UNREACHABLE: siteverify call failed — accepting lead (fail open).',
      err
    );
    return true;
  }
}

/** Validates uploaded files server-side (never trust the client). */
function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  let total = 0;
  for (const file of files) {
    const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `${file.name}: unsupported file type.`;
    }
    if (file.size > MAX_FILE_BYTES) return `${file.name} is too large.`;
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) return 'Total attachment size is too large.';
  return null;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot — silently accept to avoid signalling bots.
  if (str(formData.get('website')).length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Form-builder submissions (P2-FB-001): a hidden `formSlug` routes the
  // request to the generalized handler below — the form DEFINITION (fields,
  // required flags, recipient, confirmation toggle) is re-resolved from Sanity
  // server-side, so the client can neither pick a recipient nor skip a
  // required field. Every pre-existing form (contact, category CTA, landing,
  // product quote, blog, search-empty) never sends `formSlug`, so the fixed
  // path below stays byte-for-byte identical.
  const builderFormSlug = str(formData.get('formSlug')).slice(0, 200);
  if (builderFormSlug) {
    return handleBuilderFormSubmission(request, formData, builderFormSlug);
  }

  const firstName = str(formData.get('firstName'));
  const lastName = str(formData.get('lastName'));
  const email = str(formData.get('email'));
  const phone = str(formData.get('phone'));
  const lookingFor = str(formData.get('lookingFor'));
  const quantityNeeded = str(formData.get('quantityNeeded'));
  const dateNeeded = str(formData.get('dateNeeded'));
  const sourceUrl = str(formData.get('sourceUrl'));
  const turnstileToken = str(formData.get('cf-turnstile-response'));
  // Optional landing-page context (P2-AI-005 part 2). The client sends ONLY the
  // slug — never a recipient email — and the slug is resolved server-side
  // against Sanity below, so a forged value cannot redirect lead email
  // anywhere (an unknown slug simply behaves like a non-landing submission).
  const landingSlug = str(formData.get('landingSlug')).slice(0, 200);
  // Optional product-quote context (P2-CP-002) — the Get a Quote form on
  // /products/<slug>. Same abuse guard as landing: ONLY the slug crosses the
  // wire; the recipient AND the product title are resolved server-side from
  // the productPage doc (a spoofed hidden field can't lie to Patrick).
  const productSlug = str(formData.get('productSlug')).slice(0, 200);
  const company = str(formData.get('company'));
  const shippingZip = str(formData.get('shippingZip')).slice(0, 20);
  const comments = str(formData.get('comments'));
  // Configurator selection (P2-CP configurator) — display strings echoed into
  // the emails + the lead record. The estimated total is a LABELED ESTIMATE
  // computed client-side from the published tiers, never a firm price.
  const selectedColor = str(formData.get('selectedColor')).slice(0, 100);
  const selectedSize = str(formData.get('selectedSize')).slice(0, 100);
  const selectedDecoration = str(formData.get('selectedDecoration')).slice(0, 100);
  const estimatedTotal = str(formData.get('estimatedTotal')).slice(0, 40);
  const isProductQuote = productSlug.length > 0;

  const errors: Record<string, string> = {};
  if (!firstName) errors.firstName = 'First name is required.';
  if (!email) errors.email = 'Email is required.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  // The product-page quote form (P2-CP configurator) requires only First Name /
  // Email / Quantity / Date — Last Name, Phone, Company are optional there and
  // it has no "looking for" textarea (the product is the subject). Every other
  // form keeps the original requirements exactly.
  if (!lastName && !isProductQuote) errors.lastName = 'Last name is required.';
  if (!phone && !isProductQuote) errors.phone = 'Phone is required.';
  if (!lookingFor && !isProductQuote) errors.lookingFor = 'Tell us what you are looking for.';
  if (!quantityNeeded) errors.quantityNeeded = 'Quantity needed is required.';
  if (!dateNeeded) errors.dateNeeded = 'Date needed is required.';

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validation failed.', fields: errors }, { status: 400 });
  }

  // Attachments — re-validate server-side.
  const rawFiles = formData
    .getAll('attachments')
    .filter((v): v is File => v instanceof File && v.size > 0);
  const fileError = validateFiles(rawFiles);
  if (fileError) {
    return NextResponse.json(
      { error: 'Attachment problem.', fields: { files: fileError } },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    );
  }

  // Auto-detect CAPTCHA — verified before doing any work. No-ops without keys.
  const captchaOk = await verifyTurnstile(turnstileToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      { error: 'Could not verify you are human. Please try again.' },
      { status: 400 }
    );
  }

  // Read each file's bytes once and reuse for the email + Sanity asset upload.
  const fileBuffers = await Promise.all(
    rawFiles.map(async (file) => ({
      filename: file.name,
      contentType: file.type || undefined,
      buffer: Buffer.from(await file.arrayBuffer()),
    }))
  );

  const emailAttachments: LeadEmailAttachment[] = fileBuffers.map((f) => ({
    filename: f.filename,
    content: f.buffer,
    contentType: f.contentType,
  }));

  // Landing-page routing (P2-AI-005 part 2): resolve the submitted slug to its
  // stored `leadRecipient` SERVER-SIDE. `landing` is null for non-landing
  // submissions, unknown slugs, and lookup failures — all of which keep the
  // pre-existing behavior exactly (site-default recipient, no confirmation).
  const landing = landingSlug ? await getLandingLeadInfo(landingSlug) : null;
  // Product-quote routing (P2-CP-002): identical model against the productPage
  // doc. Landing wins if a submission somehow carries both slugs; an unknown
  // product slug degrades to the default non-quote behavior. The lookup is
  // structurally a LandingLeadInfo ({leadRecipient, title}), so the SAME
  // routing resolver applies — one abuse-guarded code path for both.
  const product = !landing && isProductQuote ? await getProductLeadInfo(productSlug) : null;
  const productTitle = product?.title?.trim() || '';
  const routing = resolveLandingLeadRouting(landing ?? product);

  const submittedAt = new Date().toISOString();
  const payload: LeadEmailPayload = {
    firstName,
    lastName,
    email,
    phone,
    lookingFor,
    quantityNeeded,
    dateNeeded,
    sourceUrl: sourceUrl || 'unknown',
    submittedAt,
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    // Quote-only extras — undefined for every other form, so the email rows
    // and subject are byte-identical to before outside the quote path.
    ...(company ? { company } : {}),
    ...(shippingZip ? { shippingZip } : {}),
    ...(comments ? { comments } : {}),
    ...(productTitle ? { productTitle } : {}),
    ...(product ? { productSlug } : {}),
    ...(selectedColor ? { selectedColor } : {}),
    ...(selectedSize ? { selectedSize } : {}),
    ...(selectedDecoration ? { selectedDecoration } : {}),
    ...(estimatedTotal ? { estimatedTotal } : {}),
  };

  try {
    // `routing.to` is null outside the valid-landing-recipient case, and
    // sendLeadEmail without an override resolves the site default itself —
    // identical to the pre-part-2 call.
    await sendLeadEmail(payload, routing.to ? { to: routing.to } : undefined);
  } catch (err) {
    console.error('[leads] email send failed', err);
    return NextResponse.json(
      { error: 'We could not send your request. Please try again or call 800-773-9472.' },
      { status: 500 }
    );
  }

  const sanity = getSanityWriteClient();
  if (sanity) {
    // Upload attachments as Sanity file assets (non-fatal — the email already sent).
    const attachmentRefs: Array<{
      _key: string;
      _type: 'file';
      asset: { _type: 'reference'; _ref: string };
    }> = [];
    for (let i = 0; i < fileBuffers.length; i += 1) {
      const f = fileBuffers[i];
      try {
        const asset = await sanity.assets.upload('file', f.buffer, {
          filename: f.filename,
          contentType: f.contentType,
        });
        attachmentRefs.push({
          _key: `att-${i}`,
          _type: 'file',
          asset: { _type: 'reference', _ref: asset._id },
        });
      } catch (err) {
        console.error('[leads] sanity asset upload failed (non-fatal)', err);
      }
    }

    try {
      await sanity.create({
        _type: 'leadSubmission',
        firstName,
        lastName,
        email,
        phone,
        // Quote submissions have no "looking for" textarea — omit the empty
        // string rather than storing a blank field. Non-quote forms always
        // have it (validated above), so their records are unchanged.
        ...(lookingFor ? { lookingFor } : {}),
        quantityNeeded,
        dateNeeded,
        sourceUrl: payload.sourceUrl,
        submittedAt,
        // Traceability for landing + product-quote submissions: the actual
        // resolved destination (per-page recipient or the site default).
        // Other docs stay exactly as before.
        ...(routing.sendConfirmation
          ? { recipient: routing.to || process.env.LEAD_EMAIL_TO || DEFAULT_LEAD_RECIPIENT }
          : {}),
        // Product-quote fields (P2-CP-002) — absent on every other form.
        ...(company ? { company } : {}),
        ...(shippingZip ? { shippingZip } : {}),
        ...(comments ? { comments } : {}),
        ...(productTitle ? { productTitle } : {}),
        ...(product ? { productSlug } : {}),
        // Configurator selection (P2-CP configurator).
        ...(selectedColor ? { selectedColor } : {}),
        ...(selectedSize ? { selectedSize } : {}),
        ...(selectedDecoration ? { selectedDecoration } : {}),
        ...(estimatedTotal ? { estimatedTotal } : {}),
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
      });
    } catch (err) {
      console.error('[leads] sanity write failed (non-fatal)', err);
    }
  }

  // Customer confirmation — landing + product-quote submissions only, after
  // the lead email + lead record. NON-FATAL by design: the lead already
  // reached its recipient, so a confirmation failure logs and the submission
  // still succeeds (same policy as the Sanity write above).
  if (routing.sendConfirmation) {
    try {
      await sendCustomerConfirmationEmail({
        to: email,
        replyTo: routing.to || process.env.LEAD_EMAIL_TO || DEFAULT_LEAD_RECIPIENT,
        firstName,
        lookingFor,
        quantityNeeded,
        dateNeeded,
        product:
          landing?.product?.trim() || landing?.title?.trim() || productTitle || undefined,
        // Quote extras — empty values are skipped by the builder, so landing
        // confirmations are unchanged.
        ...(company ? { company } : {}),
        ...(shippingZip ? { shippingZip } : {}),
        ...(comments ? { comments } : {}),
        ...(selectedColor ? { selectedColor } : {}),
        ...(selectedSize ? { selectedSize } : {}),
        ...(selectedDecoration ? { selectedDecoration } : {}),
        ...(estimatedTotal ? { estimatedTotal } : {}),
        sourceUrl: payload.sourceUrl,
      });
    } catch (err) {
      console.error('[leads] customer confirmation failed (non-fatal)', err);
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Form-builder submissions (P2-FB-001). One generalized path for every `form`
 * document: resolve the definition server-side, validate the answers against
 * it, email the form's stored recipient with a label:value block of all
 * answers, write a `leadSubmission` (formTitle/formSlug/answers[]), and send
 * the customer confirmation when the form enables it. Shares the exact spam
 * stack of the fixed path — honeypot (checked before dispatch), rate limit,
 * Turnstile, and the shared attachment limits.
 */
async function handleBuilderFormSubmission(
  request: Request,
  formData: FormData,
  formSlug: string,
): Promise<NextResponse> {
  // The SERVER's copy of the form is authoritative — recipient, confirmation
  // toggle, and required fields all come from Sanity, never the client.
  const form = await getFormBySlug(formSlug);
  if (!form || form.fields.length === 0) {
    return NextResponse.json(
      { error: 'This form is unavailable. Please try again later or call 800-773-9472.' },
      { status: 400 },
    );
  }

  const sourceUrl = str(formData.get('sourceUrl')) || 'unknown';
  const turnstileToken = str(formData.get('cf-turnstile-response'));
  // Optional catalog context (P2-CAT-002) — the catalog landing CTAs pass a
  // hidden `catalogSlug`. CONTEXT only, never routing: the slug is validated
  // against a published catalogPage below (title + canonical slug resolved
  // server-side); an unknown/forged slug degrades to a plain builder-form
  // submission. The recipient stays the form doc's stored address regardless.
  const catalogSlug = str(formData.get('catalogSlug')).slice(0, 200);

  // Collect answers + files under the definition-derived field names (the
  // client computes the same names from the same definition via fieldName()).
  const answers: Record<string, AnswerValue> = {};
  const fileCounts: Record<string, number> = {};
  const fileNames: Record<string, string[]> = {};
  const rawFiles: File[] = [];
  form.fields.forEach((field, index) => {
    const name = fieldName(field, index);
    if (field.fieldType === 'fileUpload') {
      const files = formData
        .getAll(name)
        .filter((v): v is File => v instanceof File && v.size > 0);
      fileCounts[name] = files.length;
      fileNames[name] = files.map((f) => f.name);
      rawFiles.push(...files);
      return;
    }
    if (field.fieldType === 'checkboxGroup') {
      answers[name] = formData
        .getAll(name)
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().slice(0, 500))
        .filter(Boolean);
      return;
    }
    answers[name] = str(formData.get(name)).slice(0, 5000);
  });

  // Server-side validation against the resolved definition — a crafted client
  // payload can't skip a required field or invent dropdown values.
  const errors = validateAnswers(form, answers, fileCounts);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validation failed.', fields: errors }, { status: 400 });
  }

  // Attachments across ALL fileUpload fields share the same limits as every
  // other lead form — re-validated server-side.
  const fileError = validateFiles(rawFiles);
  if (fileError) {
    return NextResponse.json(
      { error: 'Attachment problem.', fields: { files: fileError } },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }

  const captchaOk = await verifyTurnstile(turnstileToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      { error: 'Could not verify you are human. Please try again.' },
      { status: 400 },
    );
  }

  // Read each file's bytes once and reuse for the email + Sanity asset upload.
  const fileBuffers = await Promise.all(
    rawFiles.map(async (file) => ({
      filename: file.name,
      contentType: file.type || undefined,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );
  const emailAttachments: LeadEmailAttachment[] = fileBuffers.map((f) => ({
    filename: f.filename,
    content: f.buffer,
    contentType: f.contentType,
  }));

  const contact = extractContactFields(form, answers);
  // Catalog delivery context (P2-CAT-002): resolve the submitted catalogSlug
  // against a published catalogPage SERVER-SIDE. `catalog` is null for
  // non-catalog submissions, unknown slugs, and lookup failures — all of which
  // keep the plain builder-form behavior exactly.
  const catalog = catalogSlug ? await getCatalogLeadInfo(catalogSlug) : null;
  const answerRows = [
    // Patrick sees at a glance which catalog was requested — first row of the
    // lead email + the record (absent on non-catalog submissions).
    ...(catalog ? [{ label: 'Catalog', value: catalog.title }] : []),
    ...buildAnswerRows(form, answers, fileNames),
  ];
  const routing = resolveFormLeadRouting(form);
  const to = routing.to || process.env.LEAD_EMAIL_TO || DEFAULT_LEAD_RECIPIENT;
  const submittedAt = new Date().toISOString();
  const fromName = `${contact.firstName} ${contact.lastName}`.trim() || contact.email;

  const leadEmail = buildFormLeadEmail({
    formTitle: form.title,
    fromName,
    answers: answerRows,
    sourceUrl,
    submittedAt,
  });
  try {
    await sendBuiltEmail({
      to,
      replyTo: contact.email || undefined,
      ...leadEmail,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    });
  } catch (err) {
    console.error('[leads] form-builder email send failed', err);
    return NextResponse.json(
      { error: 'We could not send your request. Please try again or call 800-773-9472.' },
      { status: 500 },
    );
  }

  // Lead record + attachments — non-fatal, same policy as the fixed path.
  const sanity = getSanityWriteClient();
  if (sanity) {
    const attachmentRefs: Array<{
      _key: string;
      _type: 'file';
      asset: { _type: 'reference'; _ref: string };
    }> = [];
    for (let i = 0; i < fileBuffers.length; i += 1) {
      const f = fileBuffers[i];
      try {
        const asset = await sanity.assets.upload('file', f.buffer, {
          filename: f.filename,
          contentType: f.contentType,
        });
        attachmentRefs.push({
          _key: `att-${i}`,
          _type: 'file',
          asset: { _type: 'reference', _ref: asset._id },
        });
      } catch (err) {
        console.error('[leads] sanity asset upload failed (non-fatal)', err);
      }
    }

    try {
      await sanity.create({
        _type: 'leadSubmission',
        // Core columns filled from label/type heuristics (see
        // extractContactFields) so the Studio list stays scannable; the FULL
        // submission is always in answers[].
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.lastName ? { lastName: contact.lastName } : {}),
        ...(contact.email ? { email: contact.email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.company ? { company: contact.company } : {}),
        formTitle: form.title,
        formSlug,
        answers: answerRows.map((row, i) => ({
          _key: `ans-${i}`,
          _type: 'formAnswer',
          label: row.label,
          value: row.value,
        })),
        sourceUrl,
        submittedAt,
        recipient: to,
        // Catalog request context (P2-CAT-002) — absent on other submissions.
        ...(catalog ? { catalogTitle: catalog.title, catalogSlug: catalog.slug } : {}),
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
      });
    } catch (err) {
      console.error('[leads] sanity write failed (non-fatal)', err);
    }
  }

  // Customer confirmation — when the form enables it AND it captured an email
  // field. NON-FATAL: the lead already reached its recipient.
  //
  // Catalog submissions (P2-CAT-002) get the GATED-LINK email instead of the
  // generic summary — the email-gated delivery: the /shop-by-theme/<slug>/catalog
  // link only ever goes to the (validated) address the visitor entered, with
  // Patrick's resolved recipient cc'd so he sees the link went out. The gated
  // URL is built server-side from the validated catalogPage slug. The link
  // email sends REGARDLESS of the form's confirmation toggle — it is the
  // deliverable of the catalog flow, not a courtesy copy, so an innocuous
  // Studio toggle can't silently break catalog delivery.
  if (contact.email && isValidEmail(contact.email) && (catalog || routing.sendConfirmation)) {
    try {
      const confirmation = catalog
        ? buildCatalogConfirmationEmail({
            firstName: contact.firstName,
            catalogTitle: catalog.title,
            catalogUrl: gatedCatalogUrl(SITE_URL, catalog.slug),
          })
        : buildFormConfirmationEmail({
            firstName: contact.firstName,
            formTitle: form.title,
            answers: answerRows,
            sourceUrl,
          });
      await sendBuiltEmail({
        to: contact.email,
        ...(catalog ? { cc: to } : {}),
        replyTo: to,
        ...confirmation,
      });
    } catch (err) {
      console.error('[leads] customer confirmation failed (non-fatal)', err);
    }
  }

  return NextResponse.json({ ok: true });
}

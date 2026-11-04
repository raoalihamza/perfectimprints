/**
 * SEC-100, Part 4.3: every lead form still WRITES once the Sanity dataset is
 * private.
 *
 * Drives the REAL /api/leads POST for each kind of form on the site, with the
 * REAL read client and query modules against a simulated private dataset
 * (lib/sanity/private-dataset.testkit.ts): a lookup only answers a request
 * carrying the read token. Mocked edges: `server-only`, Turnstile, email, the
 * write client (which records what it was asked to create) and the draft
 * quote helper (it has its own tests and cannot throw).
 *
 * The kinds of form: the general contact form (/contact and the blog/search
 * sidebars use the same LeadForm), the category CTA bar's "Find Products for
 * Me" modal (same LeadForm, a category source page), the product page Get a
 * Quote form, a landing page form, the four service quote forms (form
 * builder) and the catalog request form (form builder + a catalog).
 *
 * Then the failure: with the read token REVOKED, the LeadForm kinds still
 * email Patrick and write the record (default recipient, the same thing a
 * Sanity outage has always produced), and the form-builder kinds answer the
 * same "form unavailable, call us" 400 they answer during an outage, because
 * the form's own definition cannot be read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldName } from '@/lib/forms/form-def';
import { installPrivateDataset } from '@/lib/sanity/private-dataset.testkit';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/turnstile', () => ({ verifyTurnstile: vi.fn(async () => true) }));
vi.mock('@/lib/leads/quote-draft-creator', () => ({ createDraftQuoteFromSubmission: vi.fn(async () => ({ created: false })) }));

const box = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  leadEmails: [] as { to?: string }[],
  builtEmails: [] as { to: string; subject: string }[],
  confirmations: 0,
}));
vi.mock('@/lib/sanity/write-client', () => ({
  getSanityWriteClient: () => ({
    create: vi.fn(async (doc: Record<string, unknown>) => {
      box.created.push(doc);
      return { ...doc, _id: `lead-${box.created.length}` };
    }),
    assets: { upload: vi.fn(async () => ({ _id: 'file-asset' })) },
  }),
}));
vi.mock('@/lib/email/gmail-smtp', () => ({
  sendLeadEmail: vi.fn(async (_payload: unknown, opts?: { to?: string }) => {
    box.leadEmails.push({ to: opts?.to });
  }),
  sendCustomerConfirmationEmail: vi.fn(async () => {
    box.confirmations++;
  }),
  sendBuiltEmail: vi.fn(async (msg: { to: string; subject: string }) => {
    box.builtEmails.push({ to: msg.to, subject: msg.subject });
  }),
}));

const READ_TOKEN = 'test-read-token-sec100';
const SERVICE_FORMS = ['kitting-quote', 'company-stores-quote', 'custom-products-quote', 'popup-stores-quote'];
const COMMON_FIELDS = [
  { _key: 'c', label: 'Company Name', fieldType: 'shortText', required: true },
  { _key: 'f', label: 'First Name', fieldType: 'shortText', required: true },
  { _key: 'p', label: 'Phone', fieldType: 'phone', required: true },
  { _key: 'e', label: 'Email', fieldType: 'email', required: true },
];

function answer(req: { query: string; params: Record<string, unknown> }): unknown {
  const q = req.query;
  if (q.includes('_type == "form"')) {
    const slug = String(req.params.slug);
    if (SERVICE_FORMS.includes(slug) || slug === 'catalog-request') {
      return { title: `Form ${slug}`, slug, recipientEmail: 'patrick@example.com', sendCustomerConfirmation: true, fields: COMMON_FIELDS };
    }
    return undefined;
  }
  if (q.includes('_type == "landingPage"')) return { leadRecipient: 'landing@example.com', product: 'Beach Towels', title: 'Beach Towels Destin' };
  if (q.includes('_type == "productPage"')) return { leadRecipient: 'product@example.com', title: 'Test Pen' };
  if (q.includes('_type == "catalogPage"')) return { title: 'Holiday Guide', slug: 'holiday-guide' };
  return undefined;
}

let sim: ReturnType<typeof installPrivateDataset> | null = null;
async function loadRoute(acceptToken: string) {
  sim = installPrivateDataset({ token: acceptToken, answer });
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj');
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production');
  vi.stubEnv('SANITY_API_READ_TOKEN', READ_TOKEN);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.perfectimprints.com');
  vi.stubEnv('LEAD_EMAIL_TO', 'patrick@example.com');
  return import('./route');
}

let ip = 0;
function post(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request('https://www.perfectimprints.com/api/leads', { method: 'POST', body: fd, headers: { 'x-forwarded-for': `10.7.0.${++ip}` } });
}
const person = { firstName: 'Test', lastName: 'Person', email: 'person@example.com', phone: '555-0100', quantityNeeded: '250', dateNeeded: '12/01/2026' };
function builder(formSlug: string, extra: Record<string, string> = {}) {
  const answers: Record<string, string> = {};
  const values = ['Test Co', 'Test', '555-0100', 'person@example.com'];
  COMMON_FIELDS.forEach((f, i) => {
    answers[fieldName(f, i)] = values[i];
  });
  return { formSlug, sourceUrl: '/services/kitting', ...answers, ...extra };
}

beforeEach(() => {
  box.created = [];
  box.leadEmails = [];
  box.builtEmails = [];
  box.confirmations = 0;
});
afterEach(() => {
  sim?.restore();
  sim = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('every lead form writes, against a PRIVATE dataset, with the read token', () => {
  it('the general contact form (/contact)', async () => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post({ ...person, lookingFor: 'Pens', sourceUrl: '/contact' }));
    expect(res.status).toBe(200);
    expect(box.leadEmails).toEqual([{ to: undefined }]);
    expect(box.created).toHaveLength(1);
    expect(box.created[0]._type).toBe('leadSubmission');
  });

  it('the category CTA bar ("Find Products for Me")', async () => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post({ ...person, lookingFor: 'Blue bottles', sourceUrl: '/cat/water-bottles' }));
    expect(res.status).toBe(200);
    expect(box.created.map((d) => d._type)).toEqual(['leadSubmission']);
  });

  it('a product page Get a Quote: routed to the product recipient, confirmation sent, record carries the product', async () => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post({ firstName: 'Test', email: 'person@example.com', quantityNeeded: '100', dateNeeded: '12/01/2026', company: 'Test Co', productSlug: 'test-pen', sourceUrl: '/products/test-pen' }));
    expect(res.status).toBe(200);
    expect(box.leadEmails).toEqual([{ to: 'product@example.com' }]);
    expect(box.confirmations).toBe(1);
    expect(box.created[0]).toMatchObject({ _type: 'leadSubmission', productTitle: 'Test Pen', productSlug: 'test-pen' });
    expect(sim!.requests.every((r) => r.authorized)).toBe(true);
  });

  it('a landing page form: routed to the landing recipient, confirmation sent', async () => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post({ ...person, lookingFor: 'Towels', landingSlug: 'custom-beach-towels-destin-fl', sourceUrl: '/custom-beach-towels-destin-fl' }));
    expect(res.status).toBe(200);
    expect(box.leadEmails).toEqual([{ to: 'landing@example.com' }]);
    expect(box.confirmations).toBe(1);
    expect(box.created).toHaveLength(1);
  });

  it.each(SERVICE_FORMS)('the %s service form (form builder)', async (slug) => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post(builder(slug)));
    expect(res.status).toBe(200);
    expect(box.builtEmails[0]).toMatchObject({ to: 'patrick@example.com' });
    expect(box.created[0]).toMatchObject({ _type: 'leadSubmission', formSlug: slug });
  });

  it('the catalog request form: the record names the catalog and the customer gets the catalog link', async () => {
    const route = await loadRoute(READ_TOKEN);
    const res = await route.POST(post(builder('catalog-request', { catalogSlug: 'holiday-guide', sourceUrl: '/shop-by-theme/holiday-guide' })));
    expect(res.status).toBe(200);
    expect(box.created[0]).toMatchObject({ formSlug: 'catalog-request', catalogSlug: 'holiday-guide', catalogTitle: 'Holiday Guide' });
    expect(box.builtEmails.some((m) => m.to === 'person@example.com')).toBe(true);
  });
});

describe('with the read token REVOKED (Sanity answers 401)', () => {
  it('the LeadForm kinds still email Patrick and write the record (default recipient, loud log)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute('a-token-that-was-revoked');
    const product = await route.POST(post({ firstName: 'Test', email: 'person@example.com', quantityNeeded: '100', dateNeeded: '12/01/2026', company: 'Test Co', productSlug: 'test-pen' }));
    const landing = await route.POST(post({ ...person, lookingFor: 'Towels', landingSlug: 'custom-beach-towels-destin-fl' }));
    const contact = await route.POST(post({ ...person, lookingFor: 'Pens', sourceUrl: '/contact' }));
    expect([product.status, landing.status, contact.status]).toEqual([200, 200, 200]);
    expect(box.leadEmails).toEqual([{ to: undefined }, { to: undefined }, { to: undefined }]);
    expect(box.created).toHaveLength(3);
    expect(log.mock.calls.some((c) => String(c[0]).includes('read token was missing or rejected'))).toBe(true);
  });

  it('the form-builder kinds answer the same "form unavailable, call us" 400 a Sanity outage has always given', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute('a-token-that-was-revoked');
    const res = await route.POST(post(builder('kitting-quote')));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('800-773-9472');
    expect(box.created).toHaveLength(0);
  });
});

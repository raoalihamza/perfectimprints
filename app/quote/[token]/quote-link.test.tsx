/**
 * SEC-100, Part 4.2: the private quote link a real customer opens still works
 * once the Sanity dataset is private, and fails safe when the read token is
 * missing.
 *
 * Drives the REAL page (/quote/<token>), its metadata, the REAL PDF route and
 * the REAL response route, through the REAL read client, against a simulated
 * private dataset (lib/sanity/private-dataset.testkit.ts): the quote is only
 * returned to a request carrying the read token. Mocked edges: `server-only`,
 * `notFound`, the Turnstile widget, the PDF renderer, the write client,
 * revalidation and email.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPrivateDataset } from '@/lib/sanity/private-dataset.testkit';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/components/forms/Turnstile', () => ({ Turnstile: () => null }));
vi.mock('@/lib/quotes/pdf/render-quote-pdf', () => ({
  renderQuotePdf: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.4 test'), fileName: 'Quote-Q-TEST-Perfect-Imprints.pdf' })),
}));
const writes = vi.hoisted(() => ({ created: [] as Record<string, unknown>[] }));
vi.mock('@/lib/sanity/write-client', () => ({
  getSanityWriteClient: () => ({
    create: vi.fn(async (doc: Record<string, unknown>) => {
      writes.created.push(doc);
      return { ...doc, _id: 'resp-1' };
    }),
  }),
}));
vi.mock('@/lib/email/gmail-smtp', () => ({ sendBuiltEmail: vi.fn(async () => undefined) }));

const READ_TOKEN = 'test-read-token-sec100';
const QUOTE_TOKEN = 'fedcba9876543210fedcba9876543210';
const QUOTE = {
  _id: 'quote-test-1',
  quoteNumber: 'Q-TEST',
  slug: QUOTE_TOKEN,
  quoteDate: '2026-10-26',
  expiryDate: '2099-12-31',
  customerCompany: 'Test Company',
  repName: 'Rep',
  repEmail: 'rep@example.com',
  lineItems: [{ _key: 'l1', _type: 'quoteCustomLine', displayName: 'Test tote', quantity: 100, unitCost: 2 }],
  salesTax: 0,
};

let sim: ReturnType<typeof installPrivateDataset> | null = null;
function privateDataset(acceptToken = READ_TOKEN) {
  sim = installPrivateDataset({
    token: acceptToken,
    answer: (req) => (req.query.includes('_type == "quote"') && req.params.slug === QUOTE_TOKEN ? QUOTE : undefined),
  });
  return sim;
}

async function load(env: { readToken?: string }) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj');
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production');
  vi.stubEnv('SANITY_API_READ_TOKEN', env.readToken ?? '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.perfectimprints.com');
  const [page, pdf, response] = await Promise.all([
    import('./page'),
    import('../../api/quote-pdf/[token]/route'),
    import('../../api/quote-response/route'),
  ]);
  return { page, pdf, response };
}

const props = (token: string) => ({ params: Promise.resolve({ token }) });
let ipCounter = 0;
function viewRequest(token: string) {
  const fd = new FormData();
  fd.set('token', token);
  fd.set('kind', 'viewed');
  return new Request('https://www.perfectimprints.com/api/quote-response', {
    method: 'POST',
    body: fd,
    headers: { 'x-forwarded-for': `10.9.0.${++ipCounter}` },
  });
}

beforeEach(() => {
  writes.created = [];
});
afterEach(() => {
  sim?.restore();
  sim = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the customer quote link, against a PRIVATE dataset', () => {
  it('with the read token: the page renders the quotation the customer was sent', async () => {
    const ds = privateDataset();
    const { page } = await load({ readToken: READ_TOKEN });
    const html = renderToStaticMarkup(await page.default(props(QUOTE_TOKEN)));
    expect(html).toContain('Quotation');
    expect(html).toContain('Q-TEST');
    expect(html).toContain('Quote date:');
    expect(html).toContain('Test tote');
    expect(ds.requests.length).toBeGreaterThan(0);
    expect(ds.requests.every((r) => r.authorized && r.perspective === 'published')).toBe(true);
  });

  it('with the read token: the link title and the noindex stay as they were', async () => {
    privateDataset();
    const { page } = await load({ readToken: READ_TOKEN });
    const meta = await page.generateMetadata(props(QUOTE_TOKEN));
    expect(meta.title).toEqual({ absolute: 'Quote Q-TEST | Perfect Imprints' });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('with the read token: the PDF downloads', async () => {
    privateDataset();
    const { pdf } = await load({ readToken: READ_TOKEN });
    const res = await pdf.GET(new Request(`https://www.perfectimprints.com/api/quote-pdf/${QUOTE_TOKEN}`, { headers: { 'x-forwarded-for': '10.8.0.1' } }), {
      params: Promise.resolve({ token: QUOTE_TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });

  it('with the read token: opening the link records a view (the response route reads the quote, then writes with the write token)', async () => {
    privateDataset();
    const { response } = await load({ readToken: READ_TOKEN });
    const res = await response.POST(viewRequest(QUOTE_TOKEN));
    expect(res.status).toBe(200);
    expect(writes.created.some((d) => d._type === 'quoteResponse' && d.kind === 'viewed')).toBe(true);
  });

  it('an unknown link still 404s, exactly as before', async () => {
    privateDataset();
    const { page } = await load({ readToken: READ_TOKEN });
    await expect(page.default(props('00000000000000000000000000000000'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('with the read token MISSING: the page fails (the last good copy stays cached) instead of telling the customer the quote is gone', async () => {
    const ds = privateDataset();
    const { page } = await load({});
    await expect(page.default(props(QUOTE_TOKEN))).rejects.toMatchObject({ name: 'SanityReadTokenMissingError' });
    expect(ds.requests).toHaveLength(0);
  });

  it('with the read token MISSING or REVOKED: the PDF and the response routes answer 503 "try again", never 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    privateDataset();
    let r = await load({});
    let pdfRes = await r.pdf.GET(new Request(`https://www.perfectimprints.com/api/quote-pdf/${QUOTE_TOKEN}`, { headers: { 'x-forwarded-for': '10.8.0.2' } }), {
      params: Promise.resolve({ token: QUOTE_TOKEN }),
    });
    expect(pdfRes.status).toBe(503);
    expect(((await pdfRes.json()) as { error: string }).error).toContain('try again');
    let viewRes = await r.response.POST(viewRequest(QUOTE_TOKEN));
    expect(viewRes.status).toBe(503);
    expect(writes.created).toHaveLength(0);

    sim?.restore();
    privateDataset('a-token-that-was-revoked');
    r = await load({ readToken: READ_TOKEN });
    pdfRes = await r.pdf.GET(new Request(`https://www.perfectimprints.com/api/quote-pdf/${QUOTE_TOKEN}`, { headers: { 'x-forwarded-for': '10.8.0.3' } }), {
      params: Promise.resolve({ token: QUOTE_TOKEN }),
    });
    expect(pdfRes.status).toBe(503);
    viewRes = await r.response.POST(viewRequest(QUOTE_TOKEN));
    expect(viewRes.status).toBe(503);
  });
});

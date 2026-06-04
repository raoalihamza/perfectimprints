import { NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import { sendLeadEmail, type LeadEmailPayload } from '@/lib/email/gmail-smtp';

export const runtime = 'nodejs';

interface RawBody {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  lookingFor?: unknown;
  quantityNeeded?: unknown;
  dateNeeded?: unknown;
  sourceUrl?: unknown;
  website?: unknown;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitStore = new Map<string, number[]>();

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

function str(value: unknown): string {
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

export async function POST(request: Request) {
  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (str(body.website).length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  const email = str(body.email);
  const phone = str(body.phone);
  const lookingFor = str(body.lookingFor);
  const quantityNeeded = str(body.quantityNeeded);
  const dateNeeded = str(body.dateNeeded);
  const sourceUrl = str(body.sourceUrl);

  const errors: Record<string, string> = {};
  if (!firstName) errors.firstName = 'First name is required.';
  if (!lastName) errors.lastName = 'Last name is required.';
  if (!email) errors.email = 'Email is required.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!phone) errors.phone = 'Phone is required.';
  if (!lookingFor) errors.lookingFor = 'Tell us what you are looking for.';
  if (!quantityNeeded) errors.quantityNeeded = 'Quantity needed is required.';
  if (!dateNeeded) errors.dateNeeded = 'Date needed is required.';

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validation failed.', fields: errors }, { status: 400 });
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    );
  }

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
  };

  try {
    await sendLeadEmail(payload);
  } catch (err) {
    console.error('[leads] email send failed', err);
    return NextResponse.json(
      { error: 'We could not send your request. Please try again or call 800-773-9472.' },
      { status: 500 }
    );
  }

  const sanity = getSanityWriteClient();
  if (sanity) {
    try {
      await sanity.create({
        _type: 'leadSubmission',
        firstName,
        lastName,
        email,
        phone,
        lookingFor,
        quantityNeeded,
        dateNeeded,
        sourceUrl: payload.sourceUrl,
        submittedAt,
      });
    } catch (err) {
      console.error('[leads] sanity write failed (non-fatal)', err);
    }
  }

  return NextResponse.json({ ok: true });
}

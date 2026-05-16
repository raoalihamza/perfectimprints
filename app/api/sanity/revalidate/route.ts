// TODO: M1-104 - Sanity webhook handler with HMAC signature verification.
// Calls revalidatePath() on affected paths for ISR.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const signature = request.headers.get('sanity-webhook-signature');
  const secret = process.env.SANITY_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured.' },
      { status: 500 },
    );
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 401 });
  }

  // TODO M1-104: verify HMAC signature, parse body, call revalidatePath().
  return NextResponse.json({ revalidated: false, todo: 'M1-104' });
}

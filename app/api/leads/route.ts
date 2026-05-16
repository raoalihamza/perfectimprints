// TODO: M3-308 - Lead capture route handler.
// Validates payload, writes leadSubmission to Sanity, sends email via Gmail SMTP.

import { NextResponse } from 'next/server';

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: 'Lead form not yet implemented. See TASKS.md M3-308.' },
    { status: 501 },
  );
}

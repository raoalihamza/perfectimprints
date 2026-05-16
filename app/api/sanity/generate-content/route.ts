// TODO: M5-505 - DeepSeek generate-content route for the Sanity AI button.

import { NextResponse } from 'next/server';

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: 'AI generation not yet implemented. See TASKS.md M5-505.' },
    { status: 501 },
  );
}

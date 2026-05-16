// TODO: M5-502 - Serve search results from the prebuilt Fuse.js index.

import { NextResponse } from 'next/server';

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: 'Search API not yet implemented. See TASKS.md M5-502.' },
    { status: 501 },
  );
}

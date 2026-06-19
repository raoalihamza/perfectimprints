// Site search (M5-502) runs ENTIRELY client-side against the prebuilt static
// index at /search-index.json (see lib/search/load-index.ts) — it does not call
// this route. This endpoint is reserved for a possible future live product
// search proxy (Geiger Searchspring), which is explicitly out of scope for now.
// Left returning 501 so nothing depends on it by accident.

import { NextResponse } from 'next/server';

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: 'Not implemented. Site search is client-side via /search-index.json (M5-502).' },
    { status: 501 },
  );
}

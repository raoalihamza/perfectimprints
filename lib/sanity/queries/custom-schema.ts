import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { customSchemaTag } from '@/lib/sanity/cache-tags';

/**
 * Custom structured-data blocks attached to a page (Task C Part 2).
 *
 * A `customSchema` Sanity document is keyed by an exact page path (`pageUrl`,
 * e.g. `/cat/water-bottles`, `/blog/foo`, `/about`, `/`) and holds one or more
 * raw JSON-LD object strings Patrick pastes. This lets him add ANY schema
 * (WebApplication, HowTo, Product, Event, …) to ANY page without taking the page
 * over / pushing it to Sanity. The blocks are validated at publish time (valid
 * JSON with `@context` + `@type`), so a broken block can't reach render.
 */
export interface CustomSchemaDoc {
  _id: string;
  pageUrl: string;
  label?: string;
  /** Raw JSON-LD object strings (each already validated in Studio). */
  jsonLd?: string[];
}

const PROJECTION = `_id, pageUrl, label, jsonLd`;

/**
 * Fetch every `customSchema` doc targeting an exact page path. Cache-tagged
 * (`customSchema:<path>`, `revalidate: false`, never `no-store`) so the host
 * page stays statically prerenderable and the webhook can revalidate in seconds.
 * Returns [] when none match or Sanity is unavailable (best-effort — the page
 * still renders, just without the extra schema).
 */
export async function getCustomSchemaForPath(path: string): Promise<CustomSchemaDoc[]> {
  if (!path) return [];
  try {
    const docs = await cachedClient.fetch<CustomSchemaDoc[]>(
      `*[_type == "customSchema" && pageUrl == $path]{ ${PROJECTION} }`,
      { path },
      { next: { tags: [customSchemaTag(path)].filter(Boolean), revalidate: false } },
    );
    return docs ?? [];
  } catch {
    return [];
  }
}

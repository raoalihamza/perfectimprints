import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'placeholder';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
const apiVersion = '2024-10-01';

export const client: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
});

export const previewClient: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
  perspective: 'previewDrafts',
});

/**
 * Cache-able published client for the `/cat/<slug>` render path. `useCdn: false`
 * is REQUIRED for Next.js fetch caching — the CDN client ignores `next` tag
 * options. Reads through this client pass `{ next: { tags, revalidate } }` so
 * they are tagged + statically prerenderable (not `no-store`), keeping the
 * category route static-generatable while the webhook revalidates by tag.
 */
export const cachedClient: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'published',
});

export function getClient(preview = false): SanityClient {
  return preview ? previewClient : client;
}

const builder = imageUrlBuilder({ projectId, dataset });

export function urlForImage(source: unknown) {
  return builder.image(source as never);
}

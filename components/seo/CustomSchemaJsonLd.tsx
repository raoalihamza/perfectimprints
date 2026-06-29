import { getCustomSchemaForPath } from '@/lib/sanity/queries/custom-schema';

/**
 * Injects Patrick's custom JSON-LD blocks onto a page (Task C Part 2).
 *
 * Patrick attaches one or more raw JSON-LD objects to ANY page via a
 * `customSchema` Sanity document keyed by `pageUrl` — without pushing the page
 * to Sanity. This shared async server component is dropped into the public page
 * templates (category, blog, video, static/legal, home, brands, deals/new/rush,
 * /faq, /videos) and emits each block as a `<script type="application/ld+json">`.
 *
 * Static-safe: the read is a cache-tagged fetch (`revalidate: false`, never
 * `no-store`) so the host route stays statically prerenderable, and the webhook
 * busts the `customSchema:<path>` tag on publish/delete. Pages without a matching
 * doc render nothing (the GROQ filter returns []), so they pay almost nothing.
 *
 * @param path The canonical page path the schema is keyed to (e.g.
 *   `/cat/water-bottles`, `/blog/foo`, `/about`, `/`).
 */
export async function CustomSchemaJsonLd({ path }: { path: string }) {
  const docs = await getCustomSchemaForPath(path);
  if (docs.length === 0) return null;

  // Flatten + parse every block. Blocks are validated as JSON with @context/@type
  // at publish time, but re-parse here defensively and skip anything malformed.
  const blocks: unknown[] = [];
  for (const doc of docs) {
    for (const raw of doc.jsonLd ?? []) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        /* skip a block that somehow isn't valid JSON */
      }
    }
  }
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, i) => (
        <script
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          type="application/ld+json"
          // Escape `<` so a pasted value can't break out of the <script> tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(block).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}

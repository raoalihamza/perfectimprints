import { client } from '@/lib/sanity/client';

export interface CustomCategorySearchEntry {
  title: string;
  slug: string;
}

/**
 * Sanity-authored category pages (custom + curated) as search entries
 * (M5-507 follow-up). Both render at `/cat/<slug>` and Sanity wins over any
 * bulk JSON page of the same slug, so these feed the live search delta and are
 * de-duped against the static index by URL on the client (Sanity-first).
 */
export async function getCustomCategorySearchEntries(): Promise<CustomCategorySearchEntry[]> {
  try {
    const docs =
      (await client.fetch<{ title?: string; slug?: { current?: string } }[]>(
        `*[(_type == "customCategory" || _type == "curatedCategory")
            && defined(title) && defined(slug.current)]{ title, slug }`,
      )) ?? [];
    return docs
      .map((d) => ({ title: (d.title ?? '').trim(), slug: d.slug?.current ?? '' }))
      .filter((e) => e.title && e.slug);
  } catch {
    return [];
  }
}

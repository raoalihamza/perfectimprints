/**
 * The four fields a generated draft gets beside its body (AUTO-202): author,
 * categories, related category slugs and the header image. Called by
 * `createBlogDraftFromTopic` after the post is written and before the one
 * create, and NEVER THROWS: a field that cannot be determined is left empty
 * and said so in `notes`, because a missing picture or author must never stop
 * a draft being created (the brief's rule, and the honest one: an empty field
 * is today's behaviour).
 *
 * The rules are pure and live in blog-fields.ts (author default, related
 * slugs from the ranking page, categories only from the setting) and
 * header-image.ts (the three sources and the chain). This file is the server
 * binding: it reads Global Settings (the SETTINGS_TAG read every page makes),
 * the generated root list and the catalog from disk, checks that the author
 * and category documents exist before referencing them (a strong reference
 * to a missing document fails the create), and runs the header image chain.
 *
 * Every effect is behind `DraftFieldsDeps` so the tests drive the real
 * function with fakes; `defaultDraftFieldsDeps` loads the server modules
 * LAZILY because the product matcher carries the `server-only` marker and
 * this module must stay loadable by vitest.
 */
import type { SanityClient } from '@sanity/client';
import { authorIdToUse, relatedCategorySlugsFor, uniqueIds } from './blog-fields';
import type { HeaderImageLibraryEntry, HeaderImageOutcome, HeaderImageSource, ReferenceProduct } from './header-image';
import { effectiveHeaderImageSource } from './header-image';
import { defaultHeaderImageDeps, noClientHeaderImageDeps, resolveHeaderImage, type ResolveHeaderImageInput } from './resolve-header-image';
import { collectBlogProductSkus } from '../blog/collect-strip-skus';
import { normalizeSku } from '../products/hidden-skus';

/** What the resolver needs from `globalSettings.blogAutomation`. */
export interface DraftFieldSettings {
  headerImageSource?: HeaderImageSource | null;
  headerImageLibrary?: readonly HeaderImageLibraryEntry[];
  defaultAuthorId?: string | null;
  defaultCategoryIds?: readonly string[];
}

export interface DraftFieldsDeps {
  settings: () => Promise<DraftFieldSettings>;
  knownRoots: () => Set<string>;
  /** The strip products, with every SKU on the site-wide hide list (HIDE-100 / HIDE-110) already removed. */
  productsBySku: (skus: string[]) => ReferenceProduct[] | Promise<ReferenceProduct[]>;
  /** The root category a phrase resolves to (the strips' resolver); only widens the LIBRARY lookup, never the stored slugs. */
  categoryForTopic: (phrase: string) => Promise<string | null>;
  authorExists: (id: string) => Promise<boolean>;
  existingCategoryIds: (ids: string[]) => Promise<string[]>;
  headerImage: (input: ResolveHeaderImageInput) => Promise<HeaderImageOutcome>;
  log?: (line: string) => void;
}

export interface ResolveDraftFieldsInput {
  topic: { query: string; page?: string | null; spacingGroups?: readonly { page?: string | null }[] };
  title: string;
  slug: string;
  body: readonly unknown[];
  /** Where the image chain starts; default the site setting (the topic path has no post override yet). */
  headerImageSource?: HeaderImageSource | null;
}

export interface ResolvedDraftFields {
  authorId: string | null;
  categoryIds: string[];
  relatedCategorySlugs: string[];
  headerImage: HeaderImageOutcome;
  /** What could not be filled, and why. */
  notes: string[];
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The real reads and effects, loaded lazily (see the header). */
export async function defaultDraftFieldsDeps(client: SanityClient | null): Promise<DraftFieldsDeps> {
  const [{ getSiteSettings }, { getAllGeneratedRootSlugs, resolveProductsBySku }] = await Promise.all([
    import('../sanity/queries/global-settings'),
    import('../categories'),
  ]);
  // The matcher and the hide-list context are server-only; loaded here,
  // where only the server ever is. A failure to load the matcher only loses
  // the wider library lookup; a failure to load the hide list hides nothing
  // extra (the generator already keeps hidden products out of the strips it
  // writes; this filter is for strips edited by hand).
  const matcher = await import('../ai/related-products').catch(() => null);
  const hidden = await import('../products/site-wide-hidden').catch(() => null);
  const imageDeps = client ? defaultHeaderImageDeps(client) : null;
  return {
    settings: async () => (await getSiteSettings()).blogAutomation,
    knownRoots: () => new Set(getAllGeneratedRootSlugs()),
    productsBySku: async (skus) => {
      const hiddenList = hidden ? await hidden.siteWideHiddenSkus().catch(() => [] as string[]) : [];
      const hiddenSet = new Set(hiddenList.map(normalizeSku));
      return resolveProductsBySku(skus)
        .filter((p) => !hiddenSet.has(normalizeSku(p.sku)))
        .map((p) => ({ sku: p.sku, name: p.name, imageUrl: p.imageUrl ?? null }));
    },
    categoryForTopic: async (phrase) => {
      try {
        return matcher ? matcher.resolveCategoryForKeywords(phrase) : null;
      } catch {
        return null;
      }
    },
    authorExists: async (id) => {
      if (!client) return false;
      const found = await client.fetch<string | null>(`*[_type == "author" && _id == $id][0]._id`, { id });
      return found === id;
    },
    existingCategoryIds: async (ids) => {
      if (!client || ids.length === 0) return [];
      const found = (await client.fetch<string[] | null>(`*[_type == "blogCategory" && _id in $ids]._id`, { ids })) ?? [];
      return ids.filter((id) => found.includes(id));
    },
    headerImage: (input) => (imageDeps ? resolveHeaderImage(input, imageDeps) : resolveHeaderImage({ ...input, clientMissing: true }, noClientHeaderImageDeps())),
    log: (line) => console.info(line),
  };
}

/**
 * Resolve the four fields for a draft. Never throws; see the header.
 */
export async function resolveDraftFields(input: ResolveDraftFieldsInput, deps: DraftFieldsDeps): Promise<ResolvedDraftFields> {
  const notes: string[] = [];
  const log = deps.log ?? (() => {});

  let settings: DraftFieldSettings = {};
  try {
    settings = (await deps.settings()) ?? {};
  } catch (err) {
    notes.push(`Global Settings could not be read (${errorText(err)}), so the defaults were used`);
  }

  // 1) Related category slugs: the ranking page, validated, known roots only.
  let relatedCategorySlugs: string[] = [];
  try {
    relatedCategorySlugs = relatedCategorySlugsFor(input.topic, deps.knownRoots());
    if (relatedCategorySlugs.length === 0) notes.push('no related category slug: the topic does not rank with a category page');
  } catch (err) {
    notes.push(`the category list could not be read (${errorText(err)}), so no related category slug was set`);
  }

  // 2) Author: the setting, else the default, and only if the document exists.
  let authorId: string | null = null;
  const wantedAuthor = authorIdToUse(settings.defaultAuthorId);
  try {
    if (await deps.authorExists(wantedAuthor)) authorId = wantedAuthor;
    else notes.push(`no author: the author document "${wantedAuthor}" does not exist`);
  } catch (err) {
    notes.push(`no author: the author could not be checked (${errorText(err)})`);
  }

  // 3) Categories: exactly what the setting names, those that exist; never a guess.
  let categoryIds: string[] = [];
  const wantedCategories = uniqueIds(settings.defaultCategoryIds);
  if (wantedCategories.length > 0) {
    try {
      categoryIds = await deps.existingCategoryIds(wantedCategories);
      if (categoryIds.length < wantedCategories.length) notes.push('a default category in Global Settings no longer exists and was skipped');
    } catch (err) {
      notes.push(`no categories: the default categories could not be checked (${errorText(err)})`);
    }
  } else {
    notes.push('no categories: Global Settings names no default categories');
  }

  // 4) The header image, from the post's own strip products.
  let products: ReferenceProduct[] = [];
  try {
    products = await deps.productsBySku(collectBlogProductSkus(input.body));
  } catch (err) {
    notes.push(`the strip products could not be read (${errorText(err)})`);
  }
  const libraryRoots = [...relatedCategorySlugs];
  const resolved = await deps.categoryForTopic(input.topic.query).catch(() => null);
  if (resolved && !libraryRoots.includes(resolved)) libraryRoots.push(resolved);
  let headerImage: HeaderImageOutcome;
  try {
    headerImage = await deps.headerImage({
      source: effectiveHeaderImageSource(input.headerImageSource, settings.headerImageSource),
      title: input.title,
      topic: input.topic.query,
      products,
      rootSlugs: libraryRoots,
      library: settings.headerImageLibrary ?? [],
      slug: input.slug,
      log,
    });
  } catch (err) {
    // The chain never throws by contract; this is the belt for the contract.
    const why = `the header image could not be resolved: ${errorText(err)}`;
    notes.push(why);
    headerImage = { kind: 'none', notes: [why] };
  }

  return { authorId, categoryIds, relatedCategorySlugs, headerImage, notes };
}

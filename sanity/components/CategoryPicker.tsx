/**
 * Searchable category picker (M5-504 Part 1).
 *
 * The 22,180 category pages are build-time JSON, not Sanity docs, so a normal
 * reference field can't target them. These inputs fetch the build-time
 * `public/category-list.json` (slug + title) plus live `customCategory` slugs
 * from Sanity, filter client-side with debounce, and let Patrick pick by title
 * or slug (facet slugs like `apparel/color/blue` included). When a searched slug
 * doesn't exist they offer "Create new category page", which creates a
 * `customCategory` (rendered at `/cat/<slug>`) and selects it.
 *
 * Two inputs share one hook (`useCategoryOptions`):
 *   - `CategoryPicker`     — multi-select, backs an `array of string`
 *     (productPlacement.addToCategories / removeFromCategories).
 *   - `CategorySlugInput`  — single-select, backs a `string`
 *     (categoryOverride.categorySlug) so a typo can't silently target nothing.
 *
 * Studio-only: no @sanity/ui dependency (kept resolvable for app typecheck) —
 * plain React + the `sanity` form API (`set` / `unset` / `useClient`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  set,
  unset,
  useClient,
  useFormValue,
  type ArrayOfPrimitivesInputProps,
  type StringInputProps,
} from 'sanity';
import { IntentLink } from 'sanity/router';
import { loadStudioJson } from './load-json';

interface CategoryEntry {
  slug: string;
  title: string;
}

interface CategoryListFile {
  categories: CategoryEntry[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const box: React.CSSProperties = {
  border: '1px solid var(--card-border-color, #ced2d9)',
  borderRadius: 4,
  padding: 8,
  background: 'var(--card-bg-color, #fff)',
};

const resultBtn = (highlighted: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  borderBottom: '1px solid #eef1f5',
  background: highlighted ? '#f6f8fa' : 'transparent',
  // Non-highlighted rows are transparent → inherit the (theme-correct) text
  // color. Highlighted rows hardcode a LIGHT background, so force dark text or
  // it's invisible in Studio's dark theme.
  color: highlighted ? '#231f20' : undefined,
  padding: '8px 10px',
  cursor: highlighted ? 'default' : 'pointer',
  font: 'inherit',
});

// ---------------------------------------------------------------------------
// Shared data + search + create logic (used by both inputs).
// ---------------------------------------------------------------------------
function useCategoryOptions() {
  const client = useClient({ apiVersion: '2024-10-01' });

  const [all, setAll] = useState<CategoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load build-time category list + live customCategory slugs once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [staticRes, custom] = await Promise.all([
        loadStudioJson<CategoryListFile>('category-list.json'),
        client
          .fetch<{ title?: string; slug?: string }[]>(
            `*[_type == "customCategory" && defined(slug.current)]{ title, "slug": slug.current }`,
          )
          .catch(() => [] as { title?: string; slug?: string }[]),
      ]);
      if (cancelled) return;
      const merged = new Map<string, CategoryEntry>();
      for (const c of staticRes?.categories ?? []) merged.set(c.slug, c);
      for (const c of custom ?? []) {
        if (c.slug) merged.set(c.slug, { slug: c.slug, title: c.title || c.slug });
      }
      // staticRes === null means the build-time list couldn't be fetched (e.g. a
      // standalone Studio not serving it) — surface that, don't look like "no match".
      setLoadError(staticRes === null);
      setAll([...merged.values()]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Debounce the query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const results = useMemo(() => {
    if (!debounced) return [];
    const out: CategoryEntry[] = [];
    for (const c of all) {
      if (c.slug.includes(debounced) || c.title.toLowerCase().includes(debounced)) {
        out.push(c);
        if (out.length >= 30) break;
      }
    }
    return out;
  }, [all, debounced]);

  const exactExists = useMemo(() => {
    const s = slugify(debounced);
    return s ? all.some((c) => c.slug === s) : true;
  }, [all, debounced]);

  const titleFor = useCallback(
    (slug: string) => all.find((c) => c.slug === slug)?.title ?? slug,
    [all],
  );

  /** Create a customCategory from the current query; returns its slug (or null). */
  const createCategory = useCallback(async (): Promise<string | null> => {
    const title = query.trim();
    const slug = slugify(title);
    if (!slug) return null;
    setCreating(true);
    setError(null);
    try {
      await client.create({
        _type: 'customCategory',
        title,
        slug: { _type: 'slug', current: slug },
        isCustom: true,
      });
      setAll((prev) => (prev.some((c) => c.slug === slug) ? prev : [...prev, { slug, title }]));
      setQuery('');
      return slug;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create category.');
      return null;
    } finally {
      setCreating(false);
    }
  }, [client, query]);

  return {
    loading,
    loadError,
    query,
    setQuery,
    debounced,
    results,
    exactExists,
    creating,
    error,
    titleFor,
    createCategory,
  };
}

// ---------------------------------------------------------------------------
// Multi-select: array of category slugs.
// ---------------------------------------------------------------------------
export function CategoryPicker(props: ArrayOfPrimitivesInputProps) {
  const { onChange } = props;
  const value = useMemo(
    () => (Array.isArray(props.value) ? (props.value as string[]) : []),
    [props.value],
  );
  const opts = useCategoryOptions();
  const selected = useMemo(() => new Set(value), [value]);

  const commit = useCallback(
    (next: string[]) => onChange(next.length ? set(next) : unset()),
    [onChange],
  );
  const add = useCallback(
    (slug: string) => {
      if (selected.has(slug)) return;
      commit([...value, slug]);
    },
    [commit, selected, value],
  );
  const remove = useCallback((slug: string) => commit(value.filter((s) => s !== slug)), [commit, value]);

  const onCreate = useCallback(async () => {
    const slug = await opts.createCategory();
    if (slug) add(slug);
  }, [add, opts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((slug) => (
            <Chip key={slug} slug={slug} title={opts.titleFor(slug)} onRemove={() => remove(slug)} />
          ))}
        </div>
      )}

      <SearchInput opts={opts} />

      {opts.debounced && (
        <div style={{ ...box, maxHeight: 260, overflowY: 'auto', padding: 0 }}>
          {opts.results.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => add(c.slug)}
              disabled={selected.has(c.slug)}
              style={resultBtn(selected.has(c.slug))}
            >
              <ResultLabel entry={c} />
            </button>
          ))}
          <NoResults opts={opts} />
          <CreateNew opts={opts} onCreate={onCreate} />
        </div>
      )}

      {opts.error && <div style={{ color: '#e11f1e', fontSize: 12 }}>{opts.error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-select: one category slug (string field).
// ---------------------------------------------------------------------------
export function CategorySlugInput(props: StringInputProps) {
  const { onChange } = props;
  const current = typeof props.value === 'string' ? props.value : '';
  const opts = useCategoryOptions();

  const select = useCallback(
    (slug: string) => {
      onChange(slug ? set(slug) : unset());
      opts.setQuery('');
    },
    [onChange, opts],
  );

  const onCreate = useCallback(async () => {
    const slug = await opts.createCategory();
    if (slug) select(slug);
  }, [opts, select]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {current && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip slug={current} title={opts.titleFor(current)} onRemove={() => onChange(unset())} />
        </div>
      )}

      <SearchInput opts={opts} placeholder="Search a category by title or slug…" />

      {opts.debounced && (
        <div style={{ ...box, maxHeight: 260, overflowY: 'auto', padding: 0 }}>
          {opts.results.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => select(c.slug)}
              disabled={c.slug === current}
              style={resultBtn(c.slug === current)}
            >
              <ResultLabel entry={c} />
            </button>
          ))}
          <NoResults opts={opts} />
          <CreateNew opts={opts} onCreate={onCreate} />
        </div>
      )}

      {opts.error && <div style={{ color: '#e11f1e', fontSize: 12 }}>{opts.error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// categoryOverride.categorySlug input: CategorySlugInput + a duplicate check.
//
// Only ONE override per category takes effect at render time, so a second doc
// for the same slug silently does nothing — which reads as "my edits are
// ignored" (exactly what happened with the duplicate `bags` overrides,
// 2026-08-05). As soon as a slug is picked that another override already
// targets, this shows that override's key details and a link to open it, and
// the schema's uniqueness validation blocks publishing the duplicate.
// ---------------------------------------------------------------------------
interface ExistingOverrideInfo {
  _id: string;
  replaceProducts?: boolean;
  addedCount: number;
}

export function OverrideCategorySlugInput(props: StringInputProps) {
  const current = typeof props.value === 'string' ? props.value.trim() : '';
  const client = useClient({ apiVersion: '2024-10-01' });
  const docId = (useFormValue(['_id']) as string | undefined) ?? '';
  const [existing, setExisting] = useState<ExistingOverrideInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!current) {
      setExisting(null);
      return;
    }
    const id = docId.replace(/^drafts\./, '');
    client
      .fetch<ExistingOverrideInfo | null>(
        `*[_type == "categoryOverride" && categorySlug == $slug && !(_id in [$id, $draftId])][0]{
          _id,
          replaceProducts,
          "addedCount": coalesce(count(addedSkus), 0) + coalesce(count(addedProducts), 0)
        }`,
        { slug: current, id, draftId: `drafts.${id}` },
      )
      .then((d) => {
        if (!cancelled) setExisting(d ?? null);
      })
      .catch(() => {
        if (!cancelled) setExisting(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, current, docId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CategorySlugInput {...props} />
      {existing && (
        <div
          style={{
            border: '1px solid #e11f1e',
            borderRadius: 4,
            background: '#fef2f2',
            color: '#7f1d1d',
            padding: '8px 10px',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>An override for /cat/{current} already exists</strong> ({existing.addedCount}{' '}
          added product{existing.addedCount === 1 ? '' : 's'}, Replace products{' '}
          {existing.replaceProducts ? 'ON' : 'OFF'}). Only one override per category works —{' '}
          <IntentLink
            intent="edit"
            params={{ id: existing._id.replace(/^drafts\./, ''), type: 'categoryOverride' }}
            style={{ color: '#e11f1e', fontWeight: 600 }}
          >
            open the existing override
          </IntentLink>{' '}
          and make your changes there. Publishing this document will be blocked.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational bits.
// ---------------------------------------------------------------------------
type Opts = ReturnType<typeof useCategoryOptions>;

function SearchInput({ opts, placeholder }: { opts: Opts; placeholder?: string }) {
  return (
    <input
      type="text"
      value={opts.query}
      onChange={(e) => opts.setQuery(e.currentTarget.value)}
      placeholder={opts.loading ? 'Loading categories…' : placeholder ?? 'Search categories by title or slug…'}
      disabled={opts.loading}
      style={{ ...box, width: '100%', font: 'inherit' }}
    />
  );
}

function ResultLabel({ entry }: { entry: CategoryEntry }) {
  return (
    <>
      <span style={{ fontSize: 13 }}>{entry.title}</span>
      <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>/cat/{entry.slug}</span>
    </>
  );
}

function NoResults({ opts }: { opts: Opts }) {
  if (opts.results.length > 0) return null;
  if (opts.loadError) {
    return (
      <div style={{ padding: '8px 10px', fontSize: 13, color: '#e11f1e' }}>
        Couldn&rsquo;t load the category list. Open the Studio at the app URL
        (e.g. <code>http://localhost:3000/admin3773752</code>) instead of the standalone
        <code> sanity dev</code> server, or run <code>pnpm build:category-list</code>.
      </div>
    );
  }
  return (
    <div style={{ padding: '8px 10px', fontSize: 13, color: '#6b7280' }}>
      No existing category matches “{opts.query.trim()}”.
    </div>
  );
}

function CreateNew({ opts, onCreate }: { opts: Opts; onCreate: () => void }) {
  if (opts.exactExists) return null;
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={opts.creating}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: '#16a34a',
        color: '#fff',
        padding: '8px 10px',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 600,
      }}
    >
      {opts.creating ? 'Creating…' : `+ Create new category page: /cat/${slugify(opts.query)}`}
    </button>
  );
}

function Chip({ slug, title, onRemove }: { slug: string; title: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#eef1f5',
        // Hardcoded light background → force dark text so the selected slug is
        // readable in Studio's dark theme (otherwise it's light-on-light).
        color: '#231f20',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 13,
      }}
      title={title}
    >
      /cat/{slug}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${slug}`}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e11f1e', fontWeight: 700 }}
      >
        ×
      </button>
    </span>
  );
}

export default CategoryPicker;

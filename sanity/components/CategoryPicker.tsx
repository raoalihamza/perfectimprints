/**
 * Searchable category picker (M5-504 Part 1) — a custom Studio input for an
 * `array of string` field holding category slugs (the `/cat/...` path).
 *
 * The 22,180 category pages are build-time JSON, not Sanity docs, so a normal
 * reference field can't target them. This input fetches the build-time
 * `public/category-list.json` (slug + title) plus live `customCategory` slugs
 * from Sanity, filters client-side with debounce, and lets Patrick pick one or
 * many. When a searched slug doesn't exist it offers "Create new category page",
 * which creates a `customCategory` (rendered at `/cat/<slug>`) and selects it.
 *
 * Studio-only: no @sanity/ui dependency (kept resolvable for app typecheck) —
 * plain React + the `sanity` form API (`set` / `unset` / `useClient`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { set, unset, useClient, type ArrayOfPrimitivesInputProps } from 'sanity';

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

export function CategoryPicker(props: ArrayOfPrimitivesInputProps) {
  const { onChange } = props;
  const value = useMemo(
    () => (Array.isArray(props.value) ? (props.value as string[]) : []),
    [props.value],
  );
  const client = useClient({ apiVersion: '2024-10-01' });

  const [all, setAll] = useState<CategoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load build-time category list + live customCategory slugs once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staticRes, custom] = await Promise.all([
          fetch('/category-list.json').then((r) =>
            r.ok ? (r.json() as Promise<CategoryListFile>) : { categories: [] },
          ),
          client.fetch<{ title?: string; slug?: string }[]>(
            `*[_type == "customCategory" && defined(slug.current)]{ title, "slug": slug.current }`,
          ),
        ]);
        if (cancelled) return;
        const merged = new Map<string, CategoryEntry>();
        for (const c of staticRes.categories ?? []) merged.set(c.slug, c);
        for (const c of custom ?? []) {
          if (c.slug) merged.set(c.slug, { slug: c.slug, title: c.title || c.slug });
        }
        setAll([...merged.values()]);
      } catch {
        if (!cancelled) setAll([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
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

  const selected = useMemo(() => new Set(value), [value]);

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

  const commit = useCallback(
    (next: string[]) => {
      onChange(next.length ? set(next) : unset());
    },
    [onChange],
  );

  const add = useCallback(
    (slug: string) => {
      if (selected.has(slug)) return;
      commit([...value, slug]);
    },
    [commit, selected, value],
  );

  const remove = useCallback(
    (slug: string) => {
      commit(value.filter((s) => s !== slug));
    },
    [commit, value],
  );

  const exactExists = useMemo(() => {
    const s = slugify(debounced);
    return s ? all.some((c) => c.slug === s) : true;
  }, [all, debounced]);

  const createNew = useCallback(async () => {
    const title = query.trim();
    const slug = slugify(title);
    if (!slug) return;
    setCreating(true);
    setError(null);
    try {
      await client.create({
        _type: 'customCategory',
        title,
        slug: { _type: 'slug', current: slug },
        isCustom: true,
      });
      setAll((prev) =>
        prev.some((c) => c.slug === slug) ? prev : [...prev, { slug, title }],
      );
      add(slug);
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create category.');
    } finally {
      setCreating(false);
    }
  }, [add, client, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((slug) => (
            <span
              key={slug}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#eef1f5',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 13,
              }}
            >
              /cat/{slug}
              <button
                type="button"
                onClick={() => remove(slug)}
                aria-label={`Remove ${slug}`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e11f1e', fontWeight: 700 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={loading ? 'Loading categories…' : 'Search categories by title or slug…'}
        disabled={loading}
        style={{ ...box, width: '100%', font: 'inherit' }}
      />

      {debounced && (
        <div style={{ ...box, maxHeight: 260, overflowY: 'auto', padding: 0 }}>
          {results.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => add(c.slug)}
              disabled={selected.has(c.slug)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderBottom: '1px solid #eef1f5',
                background: selected.has(c.slug) ? '#f6f8fa' : 'transparent',
                padding: '8px 10px',
                cursor: selected.has(c.slug) ? 'default' : 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ fontSize: 13 }}>{c.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>/cat/{c.slug}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: '#6b7280' }}>
              No existing category matches “{query.trim()}”.
            </div>
          )}
          {!exactExists && (
            <button
              type="button"
              onClick={createNew}
              disabled={creating}
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
              {creating ? 'Creating…' : `+ Create new category page: /cat/${slugify(query)}`}
            </button>
          )}
        </div>
      )}

      {error && <div style={{ color: '#e11f1e', fontSize: 12 }}>{error}</div>}
    </div>
  );
}

export default CategoryPicker;

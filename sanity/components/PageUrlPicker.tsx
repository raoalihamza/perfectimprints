/**
 * Page-URL picker for `customSchema.pageUrl` (Task C Part 2).
 *
 * Patrick attaches custom JSON-LD to ANY page, so this single-select string
 * input targets ANY site path — without pushing the page to Sanity:
 *   - It searches the build-time `category-list.json` (the SAME all-URL source
 *     `CategoryPicker`/`CategorySlugInput` use), so all 22,180 `/cat/...` pages
 *     are searchable; clicking a result stores `/cat/<slug>` (the full path).
 *   - It ALSO accepts a manually typed path for non-category pages (`/about`,
 *     `/blog/<slug>`, `/videos/<slug>`, `/`, …) via the "Use this exact path"
 *     action, normalized and validated by the schema field.
 *
 * Studio-only: plain React + the `sanity` form API (no `@sanity/ui` dependency),
 * mirroring CategoryPicker. The shared `loadStudioJson` loader resolves the list
 * from `public/` (embedded Studio) or `sanity/static/` (standalone Studio).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { set, unset, type StringInputProps } from 'sanity';
import { loadStudioJson } from './load-json';

interface CategoryEntry {
  slug: string;
  title: string;
}

interface CategoryListFile {
  categories: CategoryEntry[];
}

/** Normalize a typed/pasted value into a site-relative path. */
function normalizePath(input: string): string {
  let v = input.trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\/[^/]+/i, ''); // drop a pasted origin
  if (!v.startsWith('/')) v = `/${v}`;
  v = v.replace(/\/{2,}/g, '/'); // collapse duplicate slashes
  if (v.length > 1) v = v.replace(/\/+$/, ''); // trim trailing slash (not root)
  return v;
}

const box: React.CSSProperties = {
  border: '1px solid var(--card-border-color, #ced2d9)',
  borderRadius: 4,
  padding: 8,
  background: 'var(--card-bg-color, #fff)',
};

const resultBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  borderBottom: '1px solid #eef1f5',
  background: 'transparent',
  padding: '8px 10px',
  cursor: 'pointer',
  font: 'inherit',
};

export function PageUrlInput(props: StringInputProps) {
  const { onChange } = props;
  const current = typeof props.value === 'string' ? props.value : '';

  const [all, setAll] = useState<CategoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the all-URL category list once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await loadStudioJson<CategoryListFile>('category-list.json');
      if (cancelled) return;
      setLoadError(res === null);
      setAll(res?.categories ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const needle = debounced.replace(/^\/?(cat\/)?/, ''); // tolerate "/cat/" typing
    const out: CategoryEntry[] = [];
    for (const c of all) {
      if (c.slug.includes(needle) || c.title.toLowerCase().includes(debounced)) {
        out.push(c);
        if (out.length >= 30) break;
      }
    }
    return out;
  }, [all, debounced]);

  const typedPath = useMemo(() => normalizePath(query), [query]);

  const select = (path: string) => {
    onChange(path ? set(path) : unset());
    setQuery('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {current && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#eef1f5',
              color: '#231f20',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 13,
            }}
            title={current}
          >
            {current}
            <button
              type="button"
              onClick={() => onChange(unset())}
              aria-label="Clear page URL"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e11f1e', fontWeight: 700 }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={
          loading
            ? 'Loading page list…'
            : 'Search a category, or type any path (e.g. /about, /blog/my-post, /)'
        }
        disabled={loading}
        style={{ ...box, width: '100%', font: 'inherit' }}
      />

      {debounced && (
        <div style={{ ...box, maxHeight: 280, overflowY: 'auto', padding: 0 }}>
          {/* Manual / exact-path option (non-category pages). */}
          {typedPath && (
            <button
              type="button"
              onClick={() => select(typedPath)}
              style={{
                ...resultBtn,
                background: '#16a34a',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Use this exact path: {typedPath}
            </button>
          )}

          {/* Category-page matches → store /cat/<slug>. */}
          {results.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => select(`/cat/${c.slug}`)}
              style={resultBtn}
            >
              <span style={{ fontSize: 13 }}>{c.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>/cat/{c.slug}</span>
            </button>
          ))}

          {results.length === 0 && loadError && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: '#e11f1e' }}>
              Couldn&rsquo;t load the category list — you can still type any exact path above. To
              enable category search, open the Studio at the app URL (e.g.{' '}
              <code>http://localhost:3000/admin3773752</code>) or run{' '}
              <code>pnpm build:category-list</code>.
            </div>
          )}
          {results.length === 0 && !loadError && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: '#6b7280' }}>
              No category matches “{query.trim()}”. Use the green button above to target this exact
              path.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PageUrlInput;

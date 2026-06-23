/**
 * "Push to Sanity" Studio tool (M5-504 push flow). A top-level Studio tool that
 * lets Patrick take over ANY existing baked category page: search all 22,180
 * slugs, pick one, and push it. The push creates a DRAFT `customCategory`
 * pre-filled from the baked JSON (heading, intro, buying guide, FAQs, current
 * product SKUs, SEO — HTML converted to Portable Text by the push API route),
 * which Patrick then reviews and publishes. Once published the slug is "owned"
 * and Sanity wins for that `/cat/<slug>`; delete/unpublish reverts to the JSON.
 *
 * Studio-only: plain React + the `sanity` client, no @sanity/ui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient, type Tool } from 'sanity';

interface CategoryEntry {
  slug: string;
  title: string;
}

interface PushFields {
  _type: 'customCategory';
  [key: string]: unknown;
}

const card: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 4,
  border: '1px solid #ced2d9',
  font: 'inherit',
};

function PushCategoryComponent() {
  const client = useClient({ apiVersion: '2024-10-01' });
  const [all, setAll] = useState<CategoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<CategoryEntry | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; msg?: string }>({
    kind: 'idle',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/category-list.json')
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d: { categories?: CategoryEntry[] }) => {
        if (!cancelled) setAll(d.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setAll([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (out.length >= 25) break;
      }
    }
    return out;
  }, [all, debounced]);

  const push = useCallback(async () => {
    if (!picked) return;
    setStatus({ kind: 'busy', msg: 'Pushing…' });
    try {
      // Refuse if a customCategory already owns this slug.
      const existing = await client.fetch<string | null>(
        `*[_type == "customCategory" && slug.current == $slug][0]._id`,
        { slug: picked.slug },
      );
      if (existing) {
        setStatus({
          kind: 'err',
          msg: `A Custom Category already exists for /cat/${picked.slug}. Edit it under "Custom Category".`,
        });
        return;
      }

      const res = await fetch(`/api/sanity/push-category?slug=${encodeURIComponent(picked.slug)}`);
      const data = (await res.json()) as { found: boolean; fields?: PushFields; error?: string };
      if (!res.ok || !data.found || !data.fields) {
        throw new Error(data.error || `No baked page found for /cat/${picked.slug}.`);
      }

      // Create a DRAFT so the page does not change until Patrick publishes.
      const draftId = `drafts.${crypto.randomUUID()}`;
      await client.create({ _id: draftId, ...data.fields });

      setStatus({
        kind: 'ok',
        msg: `Draft created for /cat/${picked.slug}. Open it under "Custom Category", review, then Publish to take over the page.`,
      });
      setPicked(null);
      setQuery('');
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Push failed.' });
    }
  }, [client, picked]);

  return (
    <div style={card}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0 }}>Push a Category to Sanity</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Take over any existing category page. The draft is pre-filled from the current page
          (heading, intro, buying guide, FAQs, products) so you edit rather than start blank.
          Publish to make Sanity own that page; delete or unpublish to revert to the original.
        </p>
      </div>

      <input
        type="text"
        value={query}
        placeholder="Search all categories by title or slug…"
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setPicked(null);
          setStatus({ kind: 'idle' });
        }}
        style={input}
      />

      {!picked && debounced && (
        <div style={{ border: '1px solid #ced2d9', borderRadius: 4, maxHeight: 300, overflowY: 'auto' }}>
          {results.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setPicked(c)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderBottom: '1px solid #eef1f5',
                background: 'transparent',
                padding: '8px 10px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ fontSize: 14 }}>{c.title}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>/cat/{c.slug}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: '#6b7280' }}>No matches.</div>
          )}
        </div>
      )}

      {picked && (
        <div style={{ border: '1px solid #ced2d9', borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{picked.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>/cat/{picked.slug}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={push}
              disabled={status.kind === 'busy'}
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 16px',
                fontWeight: 600,
                cursor: status.kind === 'busy' ? 'default' : 'pointer',
              }}
            >
              {status.kind === 'busy' ? 'Pushing…' : 'Push to Sanity'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setStatus({ kind: 'idle' });
              }}
              style={{
                background: 'transparent',
                border: '1px solid #ced2d9',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status.msg && (
        <div
          style={{
            fontSize: 13,
            color: status.kind === 'err' ? '#e11f1e' : status.kind === 'ok' ? '#16a34a' : '#6b7280',
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}

export const pushCategoryTool: Tool = {
  name: 'push-category',
  title: 'Push to Sanity',
  component: PushCategoryComponent,
};

export default pushCategoryTool;

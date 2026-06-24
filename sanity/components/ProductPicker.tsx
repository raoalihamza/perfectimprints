/**
 * Searchable product (SKU) picker (M5-504).
 *
 * Lets Patrick search the ~7,957 Geiger catalog by product name / SKU / brand
 * and pick a SKU — instead of typing the number from memory. Fetches the
 * build-time `product-list.json` (sku + name + brand) and filters client-side.
 *
 * Two inputs share one hook (`useProductOptions`):
 *   - `ProductSkuPicker` — multi-select, backs an `array of string` SKU list
 *     (customCategory.productSkus, categoryOverride.addedSkus / hiddenSkus).
 *   - `ProductSkuInput`  — single-select, backs a `string` SKU
 *     (productPlacement.sku).
 *
 * Studio-only: no @sanity/ui dependency — plain React + the `sanity` form API.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { set, unset, type ArrayOfPrimitivesInputProps, type StringInputProps } from 'sanity';
import { loadStudioJson } from './load-json';

interface ProductEntry {
  sku: string;
  name: string;
  brand: string | null;
}

interface ProductListFile {
  products: ProductEntry[];
}

const box: React.CSSProperties = {
  border: '1px solid var(--card-border-color, #ced2d9)',
  borderRadius: 4,
  padding: 8,
  background: 'var(--card-bg-color, #fff)',
};

function useProductOptions() {
  const [all, setAll] = useState<ProductEntry[]>([]);
  const [bySku, setBySku] = useState<Map<string, ProductEntry>>(new Map());
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await loadStudioJson<ProductListFile>('product-list.json');
      if (cancelled) return;
      const products = file?.products ?? [];
      setAll(products);
      setBySku(new Map(products.map((p) => [p.sku, p])));
      setLoadError(file === null);
      setLoading(false);
    })();
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
    const out: ProductEntry[] = [];
    for (const p of all) {
      if (
        p.sku.toLowerCase().includes(debounced) ||
        p.name.toLowerCase().includes(debounced) ||
        (p.brand ? p.brand.toLowerCase().includes(debounced) : false)
      ) {
        out.push(p);
        if (out.length >= 30) break;
      }
    }
    return out;
  }, [all, debounced]);

  const labelFor = useCallback(
    (sku: string) => {
      const p = bySku.get(sku);
      if (!p) return sku;
      return `${sku} — ${p.name}${p.brand ? ` (${p.brand})` : ''}`;
    },
    [bySku],
  );

  return { loading, loadError, query, setQuery, debounced, results, labelFor };
}

type Opts = ReturnType<typeof useProductOptions>;

function SearchInput({ opts, placeholder }: { opts: Opts; placeholder: string }) {
  return (
    <input
      type="text"
      value={opts.query}
      onChange={(e) => opts.setQuery(e.currentTarget.value)}
      placeholder={opts.loading ? 'Loading products…' : placeholder}
      disabled={opts.loading}
      style={{ ...box, width: '100%', font: 'inherit' }}
    />
  );
}

function ResultsDropdown({
  opts,
  isSelected,
  onPick,
}: {
  opts: Opts;
  isSelected: (sku: string) => boolean;
  onPick: (sku: string) => void;
}) {
  if (!opts.debounced) return null;
  return (
    <div style={{ ...box, maxHeight: 280, overflowY: 'auto', padding: 0 }}>
      {opts.results.map((p) => {
        const picked = isSelected(p.sku);
        return (
          <button
            key={p.sku}
            type="button"
            onClick={() => onPick(p.sku)}
            disabled={picked}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderBottom: '1px solid #eef1f5',
              background: picked ? '#f6f8fa' : 'transparent',
              color: picked ? '#231f20' : undefined,
              padding: '8px 10px',
              cursor: picked ? 'default' : 'pointer',
              font: 'inherit',
            }}
          >
            <span style={{ fontSize: 13 }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>
              SKU {p.sku}
              {p.brand ? ` · ${p.brand}` : ''}
            </span>
          </button>
        );
      })}
      {opts.results.length === 0 &&
        (opts.loadError ? (
          <div style={{ padding: '8px 10px', fontSize: 13, color: '#e11f1e' }}>
            Couldn&rsquo;t load the product list. Open the Studio at the app URL
            (e.g. <code>http://localhost:3000/admin</code>) instead of standalone
            <code> sanity dev</code>, or run <code>pnpm build:product-list</code>.
          </div>
        ) : (
          <div style={{ padding: '8px 10px', fontSize: 13, color: '#6b7280' }}>
            No product matches “{opts.query.trim()}”.
          </div>
        ))}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
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
        maxWidth: '100%',
      }}
      title={label}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e11f1e', fontWeight: 700 }}
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Multi-select: array of SKU strings.
// ---------------------------------------------------------------------------
export function ProductSkuPicker(props: ArrayOfPrimitivesInputProps) {
  const { onChange } = props;
  const value = useMemo(
    () => (Array.isArray(props.value) ? (props.value as string[]) : []),
    [props.value],
  );
  const opts = useProductOptions();
  const selected = useMemo(() => new Set(value), [value]);

  const add = useCallback(
    (sku: string) => {
      if (selected.has(sku)) return;
      onChange(set([...value, sku]));
    },
    [onChange, selected, value],
  );
  const remove = useCallback(
    (sku: string) => {
      const next = value.filter((s) => s !== sku);
      onChange(next.length ? set(next) : unset());
    },
    [onChange, value],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((sku) => (
            <Chip key={sku} label={opts.labelFor(sku)} onRemove={() => remove(sku)} />
          ))}
        </div>
      )}
      <SearchInput opts={opts} placeholder="Search products by name, SKU, or brand…" />
      <ResultsDropdown opts={opts} isSelected={(s) => selected.has(s)} onPick={add} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-select: one SKU string.
// ---------------------------------------------------------------------------
export function ProductSkuInput(props: StringInputProps) {
  const { onChange } = props;
  const current = typeof props.value === 'string' ? props.value : '';
  const opts = useProductOptions();

  const select = useCallback(
    (sku: string) => {
      onChange(sku ? set(sku) : unset());
      opts.setQuery('');
    },
    [onChange, opts],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {current && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={opts.labelFor(current)} onRemove={() => onChange(unset())} />
        </div>
      )}
      <SearchInput opts={opts} placeholder="Search a product by name, SKU, or brand…" />
      <ResultsDropdown opts={opts} isSelected={(s) => s === current} onPick={select} />
    </div>
  );
}

export default ProductSkuPicker;

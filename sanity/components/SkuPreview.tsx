/**
 * SKU preview input (M5-504 Part 2) — wraps the default string input on
 * `productPlacement.sku` and shows the resolved Geiger product name underneath,
 * so Patrick can confirm he typed the right SKU. Resolution is live against
 * data/geiger/products.json via /api/products/resolve (so it tracks re-scrapes).
 *
 * Studio-only: plain React, no @sanity/ui (kept resolvable for app typecheck).
 */
import { useEffect, useRef, useState } from 'react';
import { type StringInputProps } from 'sanity';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; name: string; brand: string | null }
  | { kind: 'missing' };

export function SkuPreview(props: StringInputProps) {
  const sku = (props.value || '').trim();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!sku) {
      setStatus({ kind: 'idle' });
      return;
    }
    setStatus({ kind: 'loading' });
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/resolve?sku=${encodeURIComponent(sku)}`);
        const data = (await res.json()) as {
          found: boolean;
          name?: string;
          brand?: string | null;
        };
        if (cancelled) return;
        setStatus(
          data.found
            ? { kind: 'found', name: data.name || sku, brand: data.brand ?? null }
            : { kind: 'missing' },
        );
      } catch {
        if (!cancelled) setStatus({ kind: 'missing' });
      }
    }, 250);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sku]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {props.renderDefault(props)}
      {status.kind === 'loading' && (
        <span style={{ fontSize: 12, color: '#6b7280' }}>Resolving SKU…</span>
      )}
      {status.kind === 'found' && (
        <span style={{ fontSize: 12, color: '#16a34a' }}>
          ✓ {status.name}
          {status.brand ? ` — ${status.brand}` : ''}
        </span>
      )}
      {status.kind === 'missing' && sku && (
        <span style={{ fontSize: 12, color: '#e11f1e' }}>
          No Geiger product found for SKU “{sku}”.
        </span>
      )}
    </div>
  );
}

export default SkuPreview;

'use client';

import type { MinQtyBucketCount } from '@/lib/filter-types';

interface MinQuantityFilterProps {
  buckets: MinQtyBucketCount[];
  selected: string[];
  onToggle: (bucketKey: string) => void;
}

export function MinQuantityFilter({ buckets, selected, onToggle }: MinQuantityFilterProps) {
  if (buckets.length === 0) {
    return <p className="text-xs text-text-muted">No values available.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {buckets.map(({ bucket, count }) => {
        const isOn = selected.includes(bucket.key);
        return (
          <li key={bucket.key}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary hover:text-brand-ink">
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(bucket.key)}
                className="h-4 w-4 rounded border-border text-brand-red focus:ring-brand-red"
                aria-label={`Minimum quantity ${bucket.label}`}
              />
              <span className="flex-1">{bucket.label}</span>
              <span className="text-xs text-text-muted">({count})</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

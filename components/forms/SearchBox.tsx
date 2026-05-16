'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// TODO: M5-502 - wire up to Fuse.js index and overlay.

interface SearchBoxProps {
  className?: string;
  placeholder?: string;
}

export function SearchBox({
  className,
  placeholder = 'Search categories and blog posts',
}: SearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <form role="search" onSubmit={onSubmit} className={className}>
      <label htmlFor="site-search" className="sr-only">
        Search
      </label>
      <div className="flex gap-2">
        <Input
          id="site-search"
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" size="md">
          Search
        </Button>
      </div>
    </form>
  );
}

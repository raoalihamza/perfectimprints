'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const PLACEHOLDER = 'Search custom tote bags, branded drinkware, personalized pens, brands...';

interface SearchPageFormProps {
  initialQuery: string;
}

/** Refine-search input on /search. Submitting navigates to /search?q=… so the
 *  server re-renders the faceted results for the new query (shareable URL). */
export function SearchPageForm({ initialQuery }: SearchPageFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  // Keep the box in sync if the URL's q changes from elsewhere.
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
      }}
      className="flex gap-2"
    >
      <label htmlFor="search-page-input" className="sr-only">
        Search
      </label>
      <Input
        id="search-page-input"
        type="search"
        name="q"
        value={query}
        autoComplete="off"
        placeholder={PLACEHOLDER}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button type="submit" variant="primary" size="md">
        Search
      </Button>
    </form>
  );
}

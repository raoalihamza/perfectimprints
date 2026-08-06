import type { ReactNode } from 'react';
import { SearchBox } from '@/components/forms/SearchBox';
import type { SearchItemType } from '@/lib/search/types';

/**
 * Heading block with the site search box beside it (Q-170 improvement 3), used
 * by the blog index (incl. its paginated variants) and the video index.
 *
 * Layout: heading takes the row, search takes roughly a quarter of it on desktop
 * and stacks UNDER the heading at full width below `lg`, so nothing is squeezed
 * on a phone. `items-end` lines the input up with the baseline of the copy
 * rather than the top of a two-line H1. The dropdown is allowed to grow
 * leftwards (`panelClassName`) because a quarter-width panel is too tight for
 * product rows with thumbnails.
 *
 * This is a SERVER component that happens to render a client island. It holds no
 * state, reads no searchParams and fetches nothing, so the pages embedding it
 * stay statically generated. See the note in CLAUDE.md §13 about a render-time
 * `useSearchParams()` silently swapping prerendered HTML for a skeleton.
 * `SearchBox` uses `useRouter` (safe) and never `useSearchParams`.
 *
 * Scope note: this is the SITE-WIDE search, identical to the header box. It
 * searches everything and lands on /search. Scoping it to blogs or videos would
 * be a different feature; see the Q-170 report. `priorityType` (Q-180) only
 * changes which result GROUP the dropdown shows first - the blog index passes
 * 'blog', the video index 'video' - so a visitor searching from those pages
 * sees the matching content type up top instead of possibly not at all.
 */
export function IndexHeadingWithSearch({
  children,
  priorityType,
}: {
  children: ReactNode;
  priorityType?: SearchItemType;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0 lg:flex-1">{children}</div>
      <div className="w-full lg:w-1/4 lg:min-w-[280px] lg:shrink-0">
        <SearchBox
          placeholder="Search the site…"
          panelClassName="lg:left-auto lg:right-0 lg:w-[26rem] lg:max-w-[calc(100vw-3rem)]"
          priorityType={priorityType}
        />
      </div>
    </div>
  );
}

'use client';

interface SocialShareBarProps {
  url: string;
  title: string;
  imageUrl?: string;
}

interface ShareTarget {
  name: string;
  buildHref: (encoded: { url: string; title: string; imageUrl: string }) => string;
  icon: React.ReactNode;
}

const TARGETS: ShareTarget[] = [
  {
    name: 'Email',
    buildHref: ({ url, title }) => `mailto:?subject=${title}&body=${url}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    buildHref: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22 12a10 10 0 1 0-11.6 9.9V14.9H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3V22A10 10 0 0 0 22 12z" />
      </svg>
    ),
  },
  {
    name: 'LinkedIn',
    buildHref: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5V9.5h3V19zM6.5 8.2A1.7 1.7 0 1 1 6.5 5a1.7 1.7 0 0 1 0 3.3zM19 19h-3v-4.7c0-1.1 0-2.6-1.6-2.6S12.6 13 12.6 14.2V19h-3V9.5h2.9v1.3h.1a3.2 3.2 0 0 1 2.9-1.6c3.1 0 3.7 2 3.7 4.7V19z" />
      </svg>
    ),
  },
  {
    name: 'Pinterest',
    buildHref: ({ url, title, imageUrl }) =>
      `https://pinterest.com/pin/create/button/?url=${url}&description=${title}${imageUrl ? `&media=${imageUrl}` : ''}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.3-5.5s-.3-.7-.3-1.7c0-1.6 1-2.8 2.1-2.8 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4 0 1.2.8 2.1 2 2.1 2.4 0 4.2-2.5 4.2-6.2 0-3.2-2.3-5.4-5.6-5.4-3.8 0-6 2.8-6 5.8 0 1.1.4 2.4 1 3 .1.1.1.2 0 .4l-.3 1.2c-.1.2-.2.3-.4.2-1.5-.7-2.4-2.8-2.4-4.6 0-3.7 2.7-7.1 7.8-7.1 4.1 0 7.3 2.9 7.3 6.8 0 4.1-2.6 7.4-6.2 7.4-1.2 0-2.3-.6-2.7-1.4L9 19c-.3 1-1 2.4-1.5 3.2A10 10 0 1 0 12 2z" />
      </svg>
    ),
  },
  {
    name: 'Twitter',
    buildHref: ({ url, title }) => `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.91l-4.81-6.27L5.7 22H2.44l8.02-9.17L1.5 2h7.04l4.34 5.74L18.244 2zm-1.21 18h1.92L7.06 4H5.04l12 16z" />
      </svg>
    ),
  },
  {
    name: 'WordPress',
    buildHref: ({ url, title }) => `https://wordpress.com/press-this.php?u=${url}&t=${title}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-8.2 10A8.2 8.2 0 0 1 5 7.4l4.6 12.7A8.2 8.2 0 0 1 3.8 12zM12 20.2c-.8 0-1.6-.1-2.4-.3l2.5-7.4 2.6 7.1A8.2 8.2 0 0 1 12 20.2zm1.2-11.7c.5 0 1-.1 1-.1.4 0 .4-.7 0-.6 0 0-1.5.1-2.5.1-1 0-2.5-.1-2.5-.1-.5 0-.5.7 0 .7 0 0 .4 0 .9.1l1.4 3.7-2 6L6 8.6c.5 0 1-.1 1-.1.5-.1.4-.8 0-.7 0 0-1.5.1-2.4.1A8.2 8.2 0 0 1 16.3 5a4 4 0 0 0-.8-.1c-.8 0-1.3.7-1.3 1.5 0 .7.4 1.2.8 1.9.3.5.7 1.1.7 2 0 .6-.2 1.4-.5 2.4l-.7 2.3-2.5-7.5h.2zm2.7 10.7L18.6 12c.5-1.2.6-2.2.6-3 0-.3 0-.6-.1-.9a8.2 8.2 0 0 1-2.7 10.6l1.5-7.5z" />
      </svg>
    ),
  },
];

function encodeAll(url: string, title: string, imageUrl?: string) {
  return {
    url: encodeURIComponent(url),
    title: encodeURIComponent(title),
    imageUrl: encodeURIComponent(imageUrl ?? ''),
  };
}

export function SocialShareBar({ url, title, imageUrl }: SocialShareBarProps) {
  const encoded = encodeAll(url, title, imageUrl);
  const buttons = TARGETS.map((t) => ({
    name: t.name,
    href: t.buildHref(encoded),
    icon: t.icon,
  }));

  return (
    <>
      {/* Desktop: vertical sticky bar on the LEFT */}
      <aside
        aria-label="Share this post"
        className="hidden lg:sticky lg:top-28 lg:flex lg:flex-col lg:gap-3"
      >
        {buttons.map((b) => (
          <a
            key={b.name}
            href={b.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${b.name}`}
            title={`Share on ${b.name}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-soft text-brand-ink transition hover:bg-brand-red hover:text-white"
          >
            {b.icon}
          </a>
        ))}
      </aside>

      {/* Mobile/tablet: horizontal row */}
      <div className="-mx-1 flex flex-wrap items-center gap-2 lg:hidden">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Share:
        </span>
        {buttons.map((b) => (
          <a
            key={b.name}
            href={b.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${b.name}`}
            title={`Share on ${b.name}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg-soft text-brand-ink transition hover:bg-brand-red hover:text-white"
          >
            {b.icon}
          </a>
        ))}
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GoogleTagManager } from '@next/third-parties/google';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ChromeGate } from '@/components/layout/ChromeGate';
import { websiteSchema } from '@/lib/seo/schema-generators';
import { TWITTER_HANDLE } from '@/lib/seo/open-graph';
import './globals.css';
import { jsonLdHtml } from '@/lib/seo/json-ld';
import { siteRobotsMetadata } from '@/lib/seo/indexing-policy';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Perfect Imprints - Custom Promotional Products',
    template: '%s | Perfect Imprints',
  },
  description:
    'Custom promotional products, branded apparel, and corporate gifts that get used, remembered, and deliver real ROI.',
  openGraph: {
    type: 'website',
    siteName: 'Perfect Imprints',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    // Site-wide X handle. Next merges the `twitter` key shallowly, so any page
    // that sets its own `twitter` object (via socialMeta() or inline) must also
    // carry site/creator — socialMeta() does, and the video page sets them too.
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  },
  // Production: the M-SEO5 large-image-preview hint and nothing else, so no
  // robots restriction is emitted (byte-identical to before FIX-890).
  // Staging (dev.perfectimprints.com, decided by the host of
  // NEXT_PUBLIC_SITE_URL in lib/seo/indexing-policy.ts): `noindex, nofollow`
  // on every route, to get the duplicate out of Google. Shallow-merge caveat:
  // a page that sets its own `robots` (category /page/N, /search, /quote,
  // the gated catalog) replaces this whole key for that page; every one of
  // those is a noindex page already, and next.config.ts adds the same
  // instruction as an X-Robots-Tag header on staging regardless.
  robots: siteRobotsMetadata(process.env.NEXT_PUBLIC_SITE_URL),
  icons: {
    // favicon.ico is a multi-size ICO (16/32/48 — Google recommends >48px and
    // reads it from the homepage) served at a URL that must stay stable across
    // deploys; the PNGs cover hi-DPI/modern surfaces. All are real files in
    // public/ — a dangling href here 404s (the old apple-touch-icon bug).
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

// GTM container id is env-driven. When unset (e.g. staging without analytics),
// nothing is rendered, so the build never hard-depends on it. Patrick manages
// GA, chat, and other tags from the GTM dashboard — no individual tags here.
const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Warm up the Geiger image CDN connection early so product images
            (the category-page LCP candidate) start downloading sooner. No
            crossOrigin — these are plain <img> loads, not CORS requests. A
            dns-prefetch fallback covers browsers that ignore preconnect. */}
        <link rel="preconnect" href="https://imgsirv.geiger.com" />
        <link rel="dns-prefetch" href="https://imgsirv.geiger.com" />
        {/* Pre-warm GTM only when analytics is configured. */}
        {gtmId ? (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
          </>
        ) : null}
      </head>
      {/* Loads GTM via next/script's default `afterInteractive` strategy — deferred, off the render-blocking path so it does not hurt LCP/Speed Index. Injects the head script + dataLayer. */}
      {gtmId ? <GoogleTagManager gtmId={gtmId} /> : null}
      <body className="flex min-h-screen flex-col font-sans">
        {/* GTM <noscript> fallback — the @next/third-parties component does not add this. Must be the first child of <body>. */}
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        <ChromeGate>
          <Header />
        </ChromeGate>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <ChromeGate>
          <Footer />
        </ChromeGate>
        {/* Organization (local-business) JSON-LD is NOT site-wide — it renders
            only on the home + contact pages (M-SEO3 Part 4). WebSite +
            SearchAction stays site-wide (enables the sitelinks search box). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(websiteSchema()) }}
        />
      </body>
    </html>
  );
}

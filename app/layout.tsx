import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GoogleTagManager } from '@next/third-parties/google';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ChromeGate } from '@/components/layout/ChromeGate';
import { OrganizationJsonLd } from '@/components/seo/OrganizationJsonLd';
import { websiteSchema } from '@/lib/seo/schema-generators';
import './globals.css';

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
  },
  icons: {
    icon: '/favicon.ico',
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
        <OrganizationJsonLd />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema()) }}
        />
      </body>
    </html>
  );
}

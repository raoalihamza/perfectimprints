import { cache } from 'react';
import { cachedClient, urlForImage } from '@/lib/sanity/client';
import { SETTINGS_TAG } from '@/lib/sanity/cache-tags';
import type { SanityImage } from '@/lib/sanity/types';
import { socialLabel } from '@/components/icons/social-icons';
import { normalizeHref } from '@/lib/sanity/normalize-href';

// ---------------------------------------------------------------------------
// Site settings — social links + contact info, Sanity-driven.
//
// Both the footer (components/layout/Footer.tsx) and the Organization JSON-LD
// (lib/seo/schema-generators.ts, rendered via components/seo/OrganizationJsonLd)
// read from here, so socials + contact are fully controlled from the
// `globalSettings` singleton — no hardcoded social URLs anywhere.
//
// `getSiteSettings()` is wrapped in React `cache()` for per-request dedup only
// (no cross-request module memo), so the footer and the schema component share a
// single fetch per render. It reads through the non-CDN `cachedClient` with the
// `SETTINGS_TAG` cache tag (revalidate:false, never no-store) — so the layout
// stays statically prerenderable AND the webhook busts the tag deterministically
// on a globalSettings publish. The old plain-CDN `client` read (useCdn:true, no
// tag) went stale on edits: the CDN serves its own ~60s copy and the untagged
// fetch wasn't reliably busted by `revalidatePath('/', 'layout')` — removing a
// footer link kept rendering. Same fix pattern as FAQs / videos / brands.
// ---------------------------------------------------------------------------

// Tagged, non-CDN fetch options for the settings read. Reading off api.sanity.io
// (not the CDN) means a publish-triggered revalidation always sees fresh data;
// the tag lets the webhook bust the footer + Organization schema in seconds on a
// globalSettings publish. Stays static/ISR (tagged, not no-store).
const SETTINGS_FETCH_OPTS = { next: { tags: [SETTINGS_TAG], revalidate: false as const } };

export interface ResolvedSocialLink {
  /** Platform key (e.g. `facebook`) — drives the built-in icon. */
  platform: string;
  /** Accessible / display label. */
  label: string;
  url: string;
  /** Resolved custom-icon URL, or null to use the built-in platform icon. */
  iconUrl: string | null;
}

export interface SiteAddress {
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface SiteContact {
  /** Zero or more phone numbers; the first is the primary (schema telephone). */
  phones: string[];
  email: string | null;
  address: SiteAddress | null;
}

export interface FooterLink {
  label: string;
  href: string;
  /** Open in a new tab. Optional so the hardcoded fallback columns omit it. */
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export interface SiteSettings {
  /** Enabled social links only, in array order (disabled ones are dropped). */
  socialLinks: ResolvedSocialLink[];
  contact: SiteContact;
  /**
   * Editable footer nav columns (the three link columns left of Contact).
   * Empty when unset — the Footer falls back to its hardcoded NAV_COLUMNS.
   */
  footerColumns: FooterColumn[];
}

interface RawSocialLink {
  platform?: string;
  label?: string;
  url?: string;
  enabled?: boolean;
  customIcon?: SanityImage;
}

interface RawContact {
  phones?: string[];
  email?: string;
  address?: Partial<SiteAddress>;
}

interface RawFooterColumn {
  heading?: string;
  links?: Array<{ label?: string; href?: string; external?: boolean }>;
}

interface RawSettings {
  socialLinks?: RawSocialLink[];
  contact?: RawContact;
  footerColumns?: RawFooterColumn[];
  // legacy flat fields — fallback only
  phoneNumber?: string;
  contactEmail?: string;
}

const QUERY = `*[_type == "globalSettings"][0]{
  socialLinks[]{ platform, label, url, enabled, customIcon },
  contact,
  footerColumns[]{ heading, links[]{ label, href, external } },
  phoneNumber,
  contactEmail
}`;

const EMPTY: SiteSettings = {
  socialLinks: [],
  contact: { phones: [], email: null, address: null },
  footerColumns: [],
};

function resolveIconUrl(image: SanityImage | undefined): string | null {
  if (!image?.asset?._ref) return null;
  try {
    return urlForImage(image).width(48).height(48).fit('max').url();
  } catch {
    return null;
  }
}

function clean(value: string | undefined | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function resolve(raw: RawSettings | null): SiteSettings {
  if (!raw) return EMPTY;

  // Enabled = not explicitly false (missing/undefined counts as enabled), and a
  // real URL is required. Disabled links are dropped here so NO consumer (footer
  // or schema) ever sees them.
  const socialLinks: ResolvedSocialLink[] = (raw.socialLinks ?? [])
    .filter((s) => s.enabled !== false && clean(s.url))
    .map((s) => ({
      platform: (s.platform || 'other').toLowerCase(),
      label: socialLabel(s.platform, s.label),
      url: (s.url as string).trim(),
      iconUrl: resolveIconUrl(s.customIcon),
    }));

  const phones = (raw.contact?.phones ?? [])
    .map((p) => clean(p))
    .filter((p): p is string => Boolean(p));
  const fallbackPhone = clean(raw.phoneNumber);
  const resolvedPhones = phones.length > 0 ? phones : fallbackPhone ? [fallbackPhone] : [];

  const email = clean(raw.contact?.email) ?? clean(raw.contactEmail);

  const a = raw.contact?.address;
  const address: SiteAddress | null =
    a && (clean(a.street) || clean(a.city) || clean(a.postalCode))
      ? {
          street: clean(a.street),
          city: clean(a.city),
          region: clean(a.region),
          postalCode: clean(a.postalCode),
          country: clean(a.country),
        }
      : null;

  // Footer columns: keep only columns with a heading and at least one valid
  // link (label + href). An empty result lets the Footer fall back to its
  // hardcoded NAV_COLUMNS so it never renders empty.
  // Internal hrefs are slash-tolerant (normalizeHref prepends `/` to bare
  // internal paths, leaves external/protocol/anchor untouched); external links
  // keep their href verbatim (they must include the full https:// scheme).
  const footerColumns: FooterColumn[] = (raw.footerColumns ?? [])
    .map((col) => ({
      heading: clean(col.heading) ?? '',
      links: (col.links ?? [])
        .map((l) => {
          const external = l.external === true;
          return {
            label: clean(l.label) ?? '',
            href: external ? clean(l.href) ?? '' : normalizeHref(l.href),
            external,
          };
        })
        .filter((l) => l.label && l.href),
    }))
    .filter((col) => col.heading && col.links.length > 0);

  return { socialLinks, contact: { phones: resolvedPhones, email, address }, footerColumns };
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const raw = await cachedClient.fetch<RawSettings | null>(QUERY, {}, SETTINGS_FETCH_OPTS);
    return resolve(raw);
  } catch {
    return EMPTY;
  }
});

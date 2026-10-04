import { cache } from 'react';
import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient, urlForRenderImage } from '@/lib/sanity/client';
import { SETTINGS_TAG } from '@/lib/sanity/cache-tags';
import type { SanityImage } from '@/lib/sanity/types';
import { socialLabel } from '@/components/icons/social-icons';
import { normalizeHref } from '@/lib/sanity/normalize-href';
import { resolvePortfolioIntro } from '@/lib/portfolio/intro';
import type { ShippingPolicy } from '@/lib/products/product-schema';
import { blockScopeOf, normalizeBlockTerm, type BlockScope } from '@/lib/blog-automation/topic-pool';
import {
  DEFAULT_HEADER_IMAGE_SOURCE,
  headerImageSourceOf,
  type HeaderImageLibraryEntry,
  type HeaderImageSource,
} from '@/lib/blog-automation/header-image';

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
  /**
   * Hours of Operation (the `hoursOfOperation` text field — may be multi-line).
   * Rendered in the footer Contact column and the category CTA banner. Null when
   * blank — consumers hide their hours line/fall back to default wording.
   */
  hours: string | null;
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

/**
 * The category CTA bar (P2-CTA-001) — the "Not finding the exact … you're
 * looking for?" prompt shown below the product grid (above the FAQs) on every
 * product-bearing category/facet page. Copy is Patrick-editable in Global
 * Settings; the `{category}` token in heading/body is replaced with the
 * category name at render time by <CategoryCtaBar>.
 */
export interface CategoryCtaBarSettings {
  enabled: boolean;
  heading: string;
  body: string;
  buttonLabel: string;
}

/**
 * Patrick's confirmed default copy. Applied in code (not just schema
 * `initialValue`) because the globalSettings document already exists in
 * production — `initialValue` never retro-fills an existing doc, so without
 * these the bar would render nothing until the fields were typed in by hand.
 * Blank field → default; hiding the bar is the `enabled` toggle's job.
 */
export const CATEGORY_CTA_BAR_DEFAULTS: Omit<CategoryCtaBarSettings, 'enabled'> = {
  heading: "Not finding the exact {category} you're looking for?",
  body: "We have other options. Contact us and we'll search through our database of over 1,000,000 promotional items.",
  buttonLabel: 'Find Products for Me',
};

/**
 * The video variant of the CTA bar (P2-CTA-001 extension) — shown on
 * `/videos/<slug>` below the related-products strip. Patrick chose the heading
 * verbatim; there is no product category on a video page, so no `{category}`
 * token (if one is typed in anyway, the renderer substitutes a generic
 * "promotional products" rather than leaving a raw token on the page).
 */
export const VIDEO_CTA_BAR_DEFAULTS: Omit<CategoryCtaBarSettings, 'enabled'> = {
  heading: "Need help choosing the right Promotional Products? We're here.",
  body: "Contact us and we'll search through our database of over 1,000,000 promotional items.",
  buttonLabel: 'Find Products for Me',
};

export interface SiteSettings {
  /** Enabled social links only, in array order (disabled ones are dropped). */
  socialLinks: ResolvedSocialLink[];
  contact: SiteContact;
  /**
   * Editable footer nav columns (the three link columns left of Contact).
   * Empty when unset — the Footer falls back to its hardcoded NAV_COLUMNS.
   */
  footerColumns: FooterColumn[];
  /** Category CTA bar copy (defaults applied — strings are never blank). */
  categoryCtaBar: CategoryCtaBarSettings;
  /** Video-page CTA bar copy (defaults applied — strings are never blank). */
  videoCtaBar: CategoryCtaBarSettings;
  /**
   * Geiger SKUs Patrick has hidden from SITE SEARCH only (Q-170 improvement 2).
   * Trimmed, blanks dropped, raw case preserved. The search read paths
   * normalize for comparison via `lib/search/hidden-skus.ts`. Empty is the
   * overwhelmingly common case and costs every read path nothing.
   *
   * This list affects search visibility and NOTHING else: category pages, the
   * aggregators, and the sitemap never consult it.
   *
   * It is NOT the site-wide list. For "hidden everywhere" use
   * `hiddenEverywhereSkus` below, and for what SEARCH actually hides (the union
   * of the two) use `searchHiddenSkuList()`.
   */
  searchHiddenSkus: string[];
  /**
   * Geiger SKUs Patrick has hidden from the WHOLE SITE (HIDE-100), i.e.
   * `globalSettings.hiddenProducts.skus`. Trimmed, blanks dropped, raw case
   * preserved; consumers normalize via `lib/products/hidden-skus.ts`.
   *
   * Purpose, in his words: these are Geiger products he has replaced with his
   * own `/products/<slug>` page, so the plain Geiger card should not compete
   * with it. Every surface that can show a Geiger product consults this list.
   *
   * Deliberately SEPARATE from `categoryOverride.hiddenSkus`, which hides a
   * product from one category only and is still the right control for an item
   * landing in a category it does not belong in. Nothing was migrated into this
   * list; it starts empty and Patrick fills it.
   */
  hiddenEverywhereSkus: string[];
  /**
   * The /portfolio page introduction (PORT-115), `globalSettings.portfolioPage.intro`:
   * Patrick's own words about the kind of work he takes on, as the shared
   * richAnswer Portable Text. Null when the field is empty or holds no text,
   * and null means the page renders nothing for it. It lives on THIS document
   * so it rides the SETTINGS_TAG read every page already performs (the layout
   * Footer) and the webhook branch that already busts it; a new document type
   * would have needed the webhook Filter edited by hand in both environments.
   */
  portfolioIntro: PortableTextBlock[] | null;
  /**
   * The site-wide shipping policy Google is told about on every /products/
   * page (MERCH-100 part 2), `globalSettings.shippingPolicy`: a percentage of
   * the order (MERCH-220, wins when set), a flat rate, the destination
   * country and handling / transit day ranges. Null when NOTHING is filled
   * in; every field is emitted only when it holds a real value (see
   * `shippingPolicyDetails`). The handling range is the FALLBACK for a
   * product with no production time of its own; a product's own figure wins.
   * It lives on this document so a change rides the SETTINGS_TAG read every
   * page already performs and the webhook branch that already busts it, which
   * is what lets Patrick change 15 to 12 with no deploy.
   */
  shippingPolicy: ShippingPolicy | null;
  /**
   * Blog automation controls (AUTO-110), `globalSettings.blogAutomation`.
   * Today only the negative keywords: the topics Patrick has blocked in the
   * Blog Topics panel (or typed here by hand). Stage 2's toggles (on/off,
   * posts per day) are added as sibling fields of this object later, with no
   * migration, because the object exists from this ticket on. Lives on this
   * singleton for the PORT-115 reason: already in the webhook Filter in both
   * environments, so a block rides SETTINGS_TAG and needs no manual step.
   */
  blogAutomation: BlogAutomationSettings;
}

export interface NegativeKeyword {
  /** The blocked term as written (trimmed, inner spaces collapsed); matching is case-insensitive. */
  term: string;
  /**
   * AUTO-116: 'topic' blocks the one topic this search belongs to (what the
   * Blog Topics tick box writes); 'word' blocks every topic containing the
   * words. A stored entry with no scope (everything written before AUTO-116,
   * and any term typed by hand) is 'word', its meaning since AUTO-110.
   */
  scope: BlockScope;
  /** When it was blocked (ISO), null for a term typed by hand without one. */
  addedAt: string | null;
  note: string | null;
}

export interface BlogAutomationSettings {
  /** Trimmed, blanks dropped, de-duplicated case-insensitively per scope, first wins. */
  negativeKeywords: NegativeKeyword[];
  /**
   * AUTO-202: where a generated post's header image comes from (the chain
   * starts here and falls back ai -> library -> product -> none); blank in
   * Studio reads as 'ai', Patrick's choice.
   */
  headerImageSource: HeaderImageSource;
  /** AUTO-202: entries with an uploaded asset only; `rootSlug` null means "any post". Empty until Patrick uploads any. */
  headerImageLibrary: HeaderImageLibraryEntry[];
  /** AUTO-202: the author reference for generated posts, or null (then the code default applies). */
  defaultAuthorId: string | null;
  /** AUTO-202: the blog categories every generated post is filed under; empty means none (never a guess). */
  defaultCategoryIds: string[];
}

/**
 * What SITE SEARCH hides: the search-only list plus the site-wide list, because
 * "hidden everywhere" includes search.
 *
 * One definition, consumed by all three search read paths (the live delta
 * route, the server-side /search Fuse, and the client overlay index) so they
 * cannot drift. Tolerates a null settings object: every search path already
 * degrades to "hide nothing" when the settings read fails.
 */
export function searchHiddenSkuList(settings: SiteSettings | null | undefined): string[] {
  if (!settings) return [];
  return [...settings.searchHiddenSkus, ...settings.hiddenEverywhereSkus];
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

interface RawCategoryCtaBar {
  enabled?: boolean;
  heading?: string;
  body?: string;
  buttonLabel?: string;
}

interface RawSettings {
  socialLinks?: RawSocialLink[];
  contact?: RawContact;
  footerColumns?: RawFooterColumn[];
  categoryCtaBar?: RawCategoryCtaBar;
  videoCtaBar?: RawCategoryCtaBar;
  siteSearch?: { hiddenSkus?: string[] };
  hiddenProducts?: { skus?: string[] };
  portfolioPage?: { intro?: unknown };
  shippingPolicy?: {
    orderPercentage?: number;
    flatRate?: number;
    destinationCountry?: string;
    handlingDaysMin?: number;
    handlingDaysMax?: number;
    transitDaysMin?: number;
    transitDaysMax?: number;
  };
  hoursOfOperation?: string;
  blogAutomation?: {
    negativeKeywords?: Array<{ term?: string; scope?: string; addedAt?: string; note?: string }>;
    headerImageSource?: string;
    headerImageLibrary?: Array<{ rootSlug?: string; alt?: string; image?: { asset?: { _ref?: string } } }>;
    defaultAuthorId?: string | null;
    defaultCategoryIds?: Array<string | null>;
  };
  // legacy flat fields — fallback only
  phoneNumber?: string;
  contactEmail?: string;
}

const QUERY = `*[_type == "globalSettings"][0]{
  socialLinks[]{ platform, label, url, enabled, customIcon },
  contact,
  footerColumns[]{ heading, links[]{ label, href, external } },
  categoryCtaBar{ enabled, heading, body, buttonLabel },
  videoCtaBar{ enabled, heading, body, buttonLabel },
  siteSearch{ hiddenSkus },
  hiddenProducts{ skus },
  portfolioPage{ intro },
  shippingPolicy{ orderPercentage, flatRate, destinationCountry, handlingDaysMin, handlingDaysMax, transitDaysMin, transitDaysMax },
  blogAutomation{
    negativeKeywords[]{ term, scope, addedAt, note },
    headerImageSource,
    headerImageLibrary[]{ rootSlug, alt, image{ asset{ _ref } } },
    "defaultAuthorId": defaultAuthor._ref,
    "defaultCategoryIds": defaultCategories[]._ref
  },
  hoursOfOperation,
  phoneNumber,
  contactEmail
}`;

const DEFAULT_CTA_BAR: CategoryCtaBarSettings = { enabled: true, ...CATEGORY_CTA_BAR_DEFAULTS };
const DEFAULT_VIDEO_CTA_BAR: CategoryCtaBarSettings = { enabled: true, ...VIDEO_CTA_BAR_DEFAULTS };

const EMPTY: SiteSettings = {
  socialLinks: [],
  contact: { phones: [], email: null, address: null, hours: null },
  footerColumns: [],
  categoryCtaBar: DEFAULT_CTA_BAR,
  videoCtaBar: DEFAULT_VIDEO_CTA_BAR,
  searchHiddenSkus: [],
  hiddenEverywhereSkus: [],
  portfolioIntro: null,
  shippingPolicy: null,
  blogAutomation: {
    negativeKeywords: [],
    headerImageSource: DEFAULT_HEADER_IMAGE_SOURCE,
    headerImageLibrary: [],
    defaultAuthorId: null,
    defaultCategoryIds: [],
  },
};

/**
 * Blog automation (AUTO-110): keep every negative keyword that has a real
 * term, normalised by the pool module's `normalizeBlockTerm` (the same rule
 * the panel writes and compares with, AUTO-116), and drop case-insensitive
 * duplicates WITHIN a scope (the first entry wins, so its date and note are
 * the ones shown; a topic block and a word block for the same words are two
 * different blocks and both kept). A missing scope reads as 'word'. A missing
 * object resolves to an empty list, the state of the singleton before AUTO-110.
 */
export function resolveBlogAutomation(raw: RawSettings['blogAutomation'] | null | undefined): BlogAutomationSettings {
  const seen = new Set<string>();
  const negativeKeywords: NegativeKeyword[] = [];
  for (const entry of raw?.negativeKeywords ?? []) {
    const term = normalizeBlockTerm(entry?.term);
    if (!term) continue;
    const scope = blockScopeOf(entry?.scope);
    const key = `${scope}:${term.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    negativeKeywords.push({ term, scope, addedAt: clean(entry.addedAt), note: clean(entry.note) });
  }
  // AUTO-202: the header image source (blank reads as AI generated), the
  // library (entries with an uploaded asset only; a blank root slug is "any
  // post"), the default author and the default categories (references read
  // as ids; blanks dropped).
  const headerImageLibrary: HeaderImageLibraryEntry[] = [];
  for (const entry of raw?.headerImageLibrary ?? []) {
    const assetRef = entry?.image?.asset?._ref?.trim();
    if (!assetRef) continue;
    headerImageLibrary.push({ rootSlug: clean(entry?.rootSlug), assetRef, alt: clean(entry?.alt) });
  }
  const defaultCategoryIds: string[] = [];
  for (const id of raw?.defaultCategoryIds ?? []) {
    const v = typeof id === 'string' ? id.trim() : '';
    if (v && !defaultCategoryIds.includes(v)) defaultCategoryIds.push(v);
  }
  return {
    negativeKeywords,
    headerImageSource: headerImageSourceOf(raw?.headerImageSource) ?? DEFAULT_HEADER_IMAGE_SOURCE,
    headerImageLibrary,
    defaultAuthorId: clean(raw?.defaultAuthorId),
    defaultCategoryIds,
  };
}

/**
 * Shipping policy (MERCH-100, extended by MERCH-220): keep a number only when
 * it is a real finite, non-negative number, keep the country only when
 * non-blank, and resolve to null when every field is blank so a consumer can
 * tell "nothing set" from "set to zero" (a zero rate is free shipping, a real
 * value). `orderPercentage` is kept only inside 0..100: the unit is PERCENT
 * (15 means 15%), and a value above 100 cannot be a share of an order, so it
 * is treated as unset rather than passed on. When it is set it wins over
 * `flatRate` downstream (see `shippingRateFor`); the precedence is decided
 * there, in one place, not here.
 */
export function resolveShippingPolicy(raw: RawSettings['shippingPolicy'] | null | undefined): ShippingPolicy | null {
  if (!raw) return null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const pct = num(raw.orderPercentage);
  const policy: ShippingPolicy = {
    orderPercentage: pct !== null && pct <= 100 ? pct : null,
    rate: num(raw.flatRate),
    destinationCountry: clean(raw.destinationCountry),
    handlingDaysMin: num(raw.handlingDaysMin),
    handlingDaysMax: num(raw.handlingDaysMax),
    transitDaysMin: num(raw.transitDaysMin),
    transitDaysMax: num(raw.transitDaysMax),
  };
  const anySet = Object.values(policy).some((v) => v !== null);
  return anySet ? policy : null;
}

function resolveIconUrl(image: SanityImage | undefined): string | null {
  if (!image?.asset?._ref) return null;
  try {
    return urlForRenderImage(image).width(48).height(48).fit('max').url();
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

  // CTA bars (category + video variants): only an explicit `enabled: false`
  // hides one (an unset field on the existing singleton counts as on), and
  // blank copy falls back to Patrick's confirmed defaults so a bar always
  // renders complete wording.
  const resolveCtaBar = (
    bar: RawCategoryCtaBar | undefined,
    defaults: Omit<CategoryCtaBarSettings, 'enabled'>,
  ): CategoryCtaBarSettings => ({
    enabled: bar?.enabled !== false,
    heading: clean(bar?.heading) ?? defaults.heading,
    body: clean(bar?.body) ?? defaults.body,
    buttonLabel: clean(bar?.buttonLabel) ?? defaults.buttonLabel,
  });

  // Search hide list (Q-170): trim and drop blanks here so no consumer has to.
  // Case is left as typed; comparison is normalized in lib/search/hidden-skus.
  const searchHiddenSkus = (raw.siteSearch?.hiddenSkus ?? [])
    .map((s) => clean(s))
    .filter((s): s is string => Boolean(s));

  // Site-wide hide list (HIDE-100), same trim-and-drop-blanks treatment.
  const hiddenEverywhereSkus = (raw.hiddenProducts?.skus ?? [])
    .map((s) => clean(s))
    .filter((s): s is string => Boolean(s));

  return {
    socialLinks,
    contact: { phones: resolvedPhones, email, address, hours: clean(raw.hoursOfOperation) },
    footerColumns,
    categoryCtaBar: resolveCtaBar(raw.categoryCtaBar, CATEGORY_CTA_BAR_DEFAULTS),
    videoCtaBar: resolveCtaBar(raw.videoCtaBar, VIDEO_CTA_BAR_DEFAULTS),
    searchHiddenSkus,
    hiddenEverywhereSkus,
    portfolioIntro: resolvePortfolioIntro(raw.portfolioPage?.intro),
    shippingPolicy: resolveShippingPolicy(raw.shippingPolicy),
    blogAutomation: resolveBlogAutomation(raw.blogAutomation),
  };
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const raw = await cachedClient.fetch<RawSettings | null>(QUERY, {}, SETTINGS_FETCH_OPTS);
    return resolve(raw);
  } catch {
    return EMPTY;
  }
});

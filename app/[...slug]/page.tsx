import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { SectionRenderer } from '@/components/page-sections/SectionRenderer';
import { LandingPageTemplate } from '@/components/landing/LandingPageTemplate';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { getPageBySlug, getAllPageSlugs } from '@/lib/sanity/queries/pages';
import {
  getLandingPageBySlug,
  getAllLandingPageSlugs,
} from '@/lib/sanity/queries/landing-pages';
import { RESERVED_SLUG_SET } from '@/lib/reserved-slugs';
import { SIMPLE_NAV } from '@/lib/nav-data';
import { socialMeta } from '@/lib/seo/open-graph';
import { buildImageUrl } from '@/lib/sanity/client';

/**
 * Top-level dynamic route for arbitrary custom `page` documents (Issue 2) AND
 * local/topic `landingPage` documents (P2-AI-005).
 *
 * Any published `page` whose slug is NOT reserved renders at `/<slug>` through
 * the same website-builder pipeline as Services/StaticPage (SectionRenderer +
 * breadcrumb + BreadcrumbList schema + injectable customSchema JSON-LD). This
 * lets Patrick recreate old-site top-level URLs (e.g. /llm-info-perfect-imprints)
 * from Studio without a code change — a publish goes live in seconds via the
 * Sanity webhook (revalidateTag PAGES_TAG + page:<slug> + revalidatePath).
 *
 * LANDING PAGES (P2-AI-005): a published `landingPage` (e.g.
 * /custom-beach-towels-destin-fl) resolves FIRST and renders the fixed
 * LandingPageTemplate; only when no landing page matches does the `page`
 * resolution run, unchanged. Landing reads are cache-tagged (LANDING_TAG +
 * landing:<slug>) so the route stays statically prerenderable while the webhook
 * revalidates a publish in seconds.
 *
 * MULTI-SEGMENT slugs. This is a ROOT CATCH-ALL ([...slug]), not a single [slug],
 * so a page whose slug contains slashes (e.g. "industry/hvac",
 * "facets/special-feature/made-in-usa") renders at its full multi-segment path.
 * A single-segment [slug] route could only ever match one path segment, so those
 * slash-containing pages 404'd even though they published fine (the schema
 * reserved-slug guard only blocks single top-level segments). `params.slug` is a
 * string[] of the path segments; we join with "/" to reconstruct the doc slug,
 * which the Sanity query matches verbatim (slug.current == "industry/hvac").
 *
 * Route-collision reasoning (why this catch-all is safe):
 *  - In the Next.js App Router, a literal segment ("/blog") and a dedicated
 *    folder route (app/cat/[...slug], app/services/[slug], the eight static-page
 *    routes, app/api/*) ALWAYS beat a same-level dynamic catch-all. So all
 *    existing routes win and never reach app/[...slug]. A root catch-all is the
 *    lowest-priority match, so /cat/..., /services/..., /blog/... stay intact.
 *  - The root path "/" is served by app/page.tsx — a non-optional catch-all
 *    ([...slug]) does not match "/", so there is no conflict there.
 *  - Defence-in-depth: we still `notFound()` for any reserved slug and for the
 *    Services page-doc slugs, so a `page` doc can never shadow a real route or
 *    render duplicate content at both /<slug> and /services/<slug>.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// On-demand SSG: non-reserved page slugs prebuild via generateStaticParams; any
// other renders on first hit and caches at the edge until the next deploy /
// webhook revalidation. (Matches the Services / footer-page routes.)
export const dynamicParams = true;
export const revalidate = false;

// The Services page docs (slug "kitting", "company-stores", …) live at
// /services/<slug>. They are valid `page` docs (so NOT in the schema-level
// reserved list), but must not ALSO render at /<slug>. Derive them from the same
// nav source the Services route uses and exclude them here.
const SERVICE_SLUGS: string[] = (SIMPLE_NAV.find((n) => n.label === 'Services')?.children ?? [])
  .map((c) => c.href)
  .filter((h) => h.startsWith('/services/'))
  .map((h) => h.replace('/services/', ''));

// Slugs this route refuses to serve: reserved top-level routes/static pages +
// the Services page slugs (rendered under /services/).
const ROUTE_RESERVED = new Set<string>([...RESERVED_SLUG_SET, ...SERVICE_SLUGS]);

interface Props {
  params: Promise<{ slug: string[] }>;
}

// Reconstruct the Sanity `page` slug from the matched path segments.
function joinSlug(segments: string[]): string {
  return (segments ?? []).join('/');
}

// Dedupe the Sanity reads between generateMetadata() and the page render.
const getPage = cache((slug: string) => getPageBySlug(slug));
const getLanding = cache((slug: string) => getLandingPageBySlug(slug));

export async function generateStaticParams() {
  // Landing pages (P2-AI-005) share this catch-all with `page` docs. Merge +
  // dedupe both slug sets (a slug should never be BOTH — see precedence below —
  // but a dupe here would just emit the same path twice, so dedupe anyway).
  const [pageSlugs, landingSlugs] = await Promise.all([
    getAllPageSlugs(),
    getAllLandingPageSlugs(),
  ]);
  return [...new Set([...landingSlugs, ...pageSlugs])]
    .filter((slug) => slug && !ROUTE_RESERVED.has(slug))
    .map((slug) => ({ slug: slug.split('/') }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = joinSlug((await params).slug);
  if (ROUTE_RESERVED.has(slug)) return {};
  const canonical = `${SITE_URL}/${slug}`;

  // landingPage wins over page at the same slug (mirrors the render below).
  const landing = await getLanding(slug);
  if (landing) {
    const title = landing.seo?.metaTitle?.trim() || `${landing.title} | Perfect Imprints`;
    const description = landing.seo?.metaDescription?.trim() || undefined;
    return {
      title: { absolute: title },
      description,
      alternates: { canonical },
      ...socialMeta({
        title: landing.heroHeading?.trim() || landing.title,
        description,
        url: canonical,
        // Honor an editor-uploaded OG image (same pattern as the video route);
        // null falls back to the branded default inside socialMeta.
        image: buildImageUrl(landing.seo?.ogImage, (b) => b.width(1200)),
      }),
    };
  }

  const page = await getPage(slug);
  if (!page) return {};

  const title = page.seo?.metaTitle?.trim() || `${page.title} | Perfect Imprints`;
  const description = page.seo?.metaDescription?.trim() || undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...socialMeta({ title: page.title, description, url: canonical }),
  };
}

export default async function TopLevelPage({ params }: Props) {
  const slug = joinSlug((await params).slug);
  if (ROUTE_RESERVED.has(slug)) notFound();

  // Precedence: a published landingPage OWNS its slug — if a `page` doc somehow
  // shares the same slug, the landing page renders and the page doc is shadowed
  // (a slug should never be both; this makes the collision deterministic).
  const landing = await getLanding(slug);
  if (landing) {
    return (
      <>
        <CustomSchemaJsonLd path={`/${slug}`} />
        <Container as="section" className="pb-2 pt-6">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: landing.title }]} />
        </Container>

        <LandingPageTemplate page={landing} />
      </>
    );
  }

  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <>
      <CustomSchemaJsonLd path={`/${slug}`} />
      <Container as="section" className="pb-2 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
      </Container>

      <SectionRenderer sections={page.sections ?? []} />
    </>
  );
}

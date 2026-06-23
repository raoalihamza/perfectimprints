// Push-to-Sanity pre-fill route (M5-504 push flow).
//
// GET ?slug=<category slug after /cat/> → returns the field values for a new
// `customCategory` PRE-FILLED from the baked category JSON (heading, intro,
// buying guide, FAQs, current product SKUs, SEO), with the stored HTML
// converted to Portable Text. The Studio "Push to Sanity" tool wraps these in a
// draft document for Patrick to review and publish. Read-only — creates nothing.

import { NextResponse } from 'next/server';
import { getCategoryContent } from '@/lib/categories';
import { htmlToBlocks, buildGuideBlocks } from '@/lib/portable-text/html-to-blocks';

export const dynamic = 'force-dynamic';

function deriveKeyword(slug: string, title: string): string {
  const root = slug.split('/')[0]?.replace(/-/g, ' ').trim();
  if (root) return `custom ${root}`;
  return `custom ${title.toLowerCase()}`;
}

let faqKey = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) {
    return NextResponse.json({ found: false, error: 'Missing slug.' }, { status: 400 });
  }

  const fileSlug = slug.split('/').join('__');
  const content = getCategoryContent(fileSlug);
  if (!content) {
    return NextResponse.json({ found: false, slug });
  }

  const fields = {
    _type: 'customCategory' as const,
    title: content.h1,
    slug: { _type: 'slug', current: slug },
    isCustom: true,
    targetKeyword: deriveKeyword(slug, content.h1),
    introHtml: htmlToBlocks(content.introHtml),
    bodySections: buildGuideBlocks(content.buyingGuideH2, content.buyingGuideHtml),
    faqs: (content.faqs ?? []).map((f) => {
      faqKey += 1;
      return { _key: `faq-${Date.now().toString(36)}-${faqKey}`, q: f.q, a: f.a };
    }),
    productSkus: content.productSkus ?? [],
    externalUrl: '',
    seo: {
      _type: 'seo',
      metaTitle: content.metaTitle,
      metaDescription: content.metaDescription,
    },
  };

  return NextResponse.json({ found: true, slug, fields });
}

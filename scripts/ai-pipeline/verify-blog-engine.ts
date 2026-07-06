/**
 * Offline verification harness for the Phase 2 AI blog + video + page +
 * landing-page engine (P2-AI-001/002/003/004/005).
 *
 *   pnpm verify:blog-engine        (or: pnpm tsx scripts/ai-pipeline/verify-blog-engine.ts)
 *
 * Runs FULLY OFFLINE — no DeepSeek, no Sanity — so it exercises the pure +
 * disk-reading engine pieces only:
 *   - matchRelatedProducts (category-first + keyword-only paths) against the
 *     real products.json / data/categories
 *   - the disk-only category portion of the internal-link engine
 *   - buildBlogBody structural output (types, keys, styles, product strips)
 *   - P2-AI-002b: the relevance floor (no bestseller padding), generic-word
 *     stripping in category resolution, cross-strip dedup via exclude sets,
 *     word-count budgeting, and auto-placed internal-link annotations
 *   - P2-AI-003 (video): buildRichAnswerBody emits ONLY richAnswer-legal
 *     blocks, and placeInternalLinks' link shapes — blog markDefs carry
 *     `openInNewTab`, richAnswer markDefs are `{_type:'link', href}` ONLY
 *   - P2-AI-004 (page): buildPageBody emits page-portableBody-legal blocks
 *     (normal + list level 1, href-only link markDefs — the default
 *     block-editor link annotation), the 'page' link-shape mode, a synthetic
 *     productStrip section's shape, and page-keyword product matching
 *   - P2-AI-005 (landing): buildPageSectionsBody emits heading-led multi-
 *     section page bodies (h2 blocks in-body), the extended internal-link
 *     interleave carries landing + video kinds (capped, href-deduped), the
 *     landmark-inclusion enforcement, and the landing field shapes (plain-text
 *     faqs, blogProduct strip entries, page-legal PT bodies)
 *
 * The Sanity-backed pieces (blog/page link suggestions, custom-product merge)
 * are guarded in the engine itself — offline they degrade gracefully, and they
 * are exercised end-to-end through the running /api/sanity/generate-blog,
 * /api/sanity/generate-video, and /api/sanity/generate-page routes.
 *
 * Prints an X/Y summary; exits non-zero on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';

import { matchRelatedProducts, resolveCategoryForKeywords } from '../../lib/ai/related-products';
import {
  interleaveScoredSuggestions,
  suggestCategoryLinks,
  type ScoredLinkSuggestion,
} from '../../lib/ai/internal-links';
import { findMissingLandmarks } from '../../lib/ai/landing-landmarks';
import { placeInternalLinks } from '../../lib/ai/place-internal-links';
import {
  buildWordBudget,
  clampWordCount,
  listIdeaCount,
  singleSectionCount,
  THIN_FLOOR_RATIO,
} from '../../lib/ai/word-budget';
import {
  buildBlogBody,
  type BlogBodyBlock,
  type BlogTextBlock,
  type BlogProductsBlock,
  type BlogInlineSpan,
} from '../../lib/portable-text/build-blog-body';
import { buildRichAnswerBody } from '../../lib/portable-text/build-rich-answer-body';
import { buildPageBody, buildPageSectionsBody } from '../../lib/portable-text/build-page-body';
import type { GeigerProduct } from '../../lib/product-types';

const ROOT = path.resolve(__dirname, '../..');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function loadCatalogSkus(): Set<string> {
  const parsed = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')) as {
    products: { sku: string }[];
  };
  return new Set(parsed.products.map((p) => p.sku));
}

async function main() {
  const catalogSkus = loadCatalogSkus();

  // -------------------------------------------------------------------------
  console.log('\n[1] matchRelatedProducts — category-first (water-bottles)');
  const opts1 = {
    categorySlug: 'water-bottles',
    keywords: ['water bottles', 'stainless steel'],
    limit: 8,
  };
  const run1a = await matchRelatedProducts(opts1);
  const run1b = await matchRelatedProducts(opts1);

  check('returns > 0 products', run1a.length > 0);
  check(`respects limit (${run1a.length} <= 8)`, run1a.length <= 8);
  check(
    'every SKU exists in products.json',
    run1a.every((p) => catalogSkus.has(p.sku)),
    run1a
      .filter((p) => !catalogSkus.has(p.sku))
      .map((p) => p.sku)
      .join(', '),
  );
  check('deduped by SKU', new Set(run1a.map((p) => p.sku)).size === run1a.length);
  check(
    'stable across two calls',
    JSON.stringify(run1a.map((p) => p.sku)) === JSON.stringify(run1b.map((p) => p.sku)),
  );

  // -------------------------------------------------------------------------
  console.log('\n[2] matchRelatedProducts — keyword-only (tote bags, no category)');
  const run2 = await matchRelatedProducts({ keywords: ['tote bags'], limit: 6 });
  check('returns > 0 products', run2.length > 0);
  check(`respects limit (${run2.length} <= 6)`, run2.length <= 6);
  check(
    'every SKU exists in products.json',
    run2.every((p: GeigerProduct) => catalogSkus.has(p.sku)),
  );
  check(
    'keyword actually matched (name mentions tote or bag)',
    run2.every((p) => /tote|bag/i.test(p.name)),
    run2.map((p) => p.name).join(' | '),
  );

  // -------------------------------------------------------------------------
  console.log('\n[3] suggestCategoryLinks — disk-only internal links (water bottles)');
  const links = suggestCategoryLinks(['water bottles'], 5);
  check('returns > 0 category links', links.length > 0);
  check(
    'every href is /cat/<slug>',
    links.every((l) => l.href.startsWith('/cat/') && l.kind === 'category'),
  );
  check(
    'every slug has a JSON file in data/categories',
    links.every((l) =>
      fs.existsSync(path.join(CATEGORIES_DIR, `${l.href.replace(/^\/cat\//, '')}.json`)),
    ),
    links.map((l) => l.href).join(', '),
  );
  check(
    'labels resolved (non-empty, not raw slugs with dashes only)',
    links.every((l) => l.label.trim().length > 0),
  );
  console.log(
    '  note: blog/page link suggestions read Sanity and are exercised through the running',
  );
  console.log('        /api/sanity/generate-blog route, not this offline harness.');

  // -------------------------------------------------------------------------
  console.log('\n[4] buildBlogBody — structural output');
  const body = buildBlogBody({
    intro: ['Opening paragraph one.', 'Opening paragraph two.'],
    sections: [
      {
        heading: 'Idea 1: Branded Water Bottles',
        headingLevel: 'h2',
        paragraphs: [
          'Plain paragraph.',
          [
            { text: 'Rich paragraph with ' },
            { text: 'bold', strong: true },
            { text: ' and a ' },
            { text: 'link', link: { href: '/cat/water-bottles' } },
            { text: '.' },
          ],
        ],
        products: { heading: 'Products for this idea', skus: ['123456', '654321', '  ', ''] },
      },
      {
        heading: 'What to Look For',
        headingLevel: 'h3',
        paragraphs: ['Section two paragraph.'],
        list: { kind: 'bullet', items: ['First point', 'Second point', ''] },
      },
    ],
  });

  const textBlocks = body.filter((b): b is BlogTextBlock => b._type === 'block');
  const productBlocks = body.filter((b): b is BlogProductsBlock => b._type === 'blogProducts');

  check(
    'only valid _types emitted',
    body.every((b: BlogBodyBlock) => b._type === 'block' || b._type === 'blogProducts'),
  );

  const allKeys: string[] = [];
  for (const b of body) {
    allKeys.push(b._key);
    if (b._type === 'block') {
      for (const c of b.children) allKeys.push(c._key);
      for (const m of b.markDefs) allKeys.push(m._key);
    } else {
      for (const p of b.products) allKeys.push(p._key);
    }
  }
  check(
    `unique _key on every block/span/markDef/product (${allKeys.length} keys)`,
    new Set(allKeys).size === allKeys.length && allKeys.every(Boolean),
  );

  check(
    'valid styles only (normal/h2/h3)',
    textBlocks.every((b) => ['normal', 'h2', 'h3'].includes(b.style)),
  );
  const listBlocks = textBlocks.filter((b) => b.listItem);
  check(
    'list items carry listItem bullet + level 1',
    listBlocks.length === 2 && listBlocks.every((b) => b.listItem === 'bullet' && b.level === 1),
  );
  check(
    'no empty text blocks (blank list item + blank paragraph dropped)',
    textBlocks.every((b) => b.children.some((c) => c.text.trim().length > 0)),
  );
  check(
    'blogProducts block: every product carries a sku, blanks dropped',
    productBlocks.length === 1 &&
      productBlocks[0].products.length === 2 &&
      productBlocks[0].products.every(
        (p) => p._type === 'blogProduct' && p.sku.trim().length > 0,
      ),
  );
  const richBlock = textBlocks.find((b) => b.markDefs.length > 0);
  check(
    'link annotation: markDef {_type:link, href} referenced by a span mark',
    !!richBlock &&
      richBlock.markDefs[0]._type === 'link' &&
      richBlock.markDefs[0].href === '/cat/water-bottles' &&
      richBlock.children.some((c) => c.marks.includes(richBlock.markDefs[0]._key)),
  );
  check(
    'strong decorator applied',
    !!richBlock && richBlock.children.some((c) => c.marks.includes('strong')),
  );
  check(
    'headings emitted at requested levels',
    textBlocks.some((b) => b.style === 'h2') && textBlocks.some((b) => b.style === 'h3'),
  );

  // -------------------------------------------------------------------------
  console.log('\n[5] relevance floor (P2-AI-002b) — never pad with irrelevant products');
  const nonsense = await matchRelatedProducts({
    keywords: ['xylophone submarines'],
    limit: 4,
    minScore: 1,
  });
  check('nonsense query returns ZERO products (no bestseller padding)', nonsense.length === 0);
  const offTopic = await matchRelatedProducts({
    categorySlug: 'water-bottles',
    keywords: ['power banks'],
    limit: 4,
    minScore: 1,
  });
  check(
    'off-topic keywords + real category: every result shares a keyword token (never the category bestsellers)',
    offTopic.every((p) => /power|bank/i.test(`${p.name} ${p.brand ?? ''}`)),
    offTopic.map((p) => p.name).join(' | '),
  );

  // -------------------------------------------------------------------------
  console.log('\n[6] generic-word stripping in category resolution');
  const withGeneric = resolveCategoryForKeywords('custom power banks');
  const withoutGeneric = resolveCategoryForKeywords('power banks');
  check(
    `"custom power banks" and "power banks" resolve identically (${withoutGeneric})`,
    withGeneric !== null && withGeneric === withoutGeneric,
    `withGeneric=${withGeneric}, withoutGeneric=${withoutGeneric}`,
  );
  check(
    'resolves to a power-bank category',
    typeof withoutGeneric === 'string' && withoutGeneric.includes('power'),
    String(withoutGeneric),
  );

  // -------------------------------------------------------------------------
  console.log('\n[7] cross-strip dedup via exclude set');
  const stripA = await matchRelatedProducts({
    categorySlug: 'water-bottles',
    keywords: ['water bottles'],
    limit: 4,
    minScore: 1,
  });
  const stripB = await matchRelatedProducts({
    categorySlug: 'water-bottles',
    keywords: ['water bottles'],
    limit: 4,
    minScore: 1,
    exclude: new Set(stripA.map((p) => p.sku)),
  });
  check(
    'no SKU appears in both strips',
    stripB.every((p) => !stripA.some((a) => a.sku === p.sku)),
  );
  check('excluded call still finds other relevant products', stripB.length > 0);

  // -------------------------------------------------------------------------
  console.log('\n[8] word-count budgeting (pure, P2-AI-002c range)');
  check(
    'clamps: 1000→1300, 3000→1900, undefined→1500',
    clampWordCount(1000) === 1300 && clampWordCount(3000) === 1900 && clampWordCount(undefined) === 1500,
  );
  const budgetSections = listIdeaCount(1500);
  const budget = buildWordBudget(1500, budgetSections);
  const budgetSum = budget.intro + budget.sectionCount * budget.perSection;
  check(
    `budget sums to ~target (intro ${budget.intro} + ${budgetSections}×${budget.perSection} = ${budgetSum} ≈ 1500) with intro in 120-180`,
    Math.abs(budgetSum - 1500) <= 1500 * 0.02 && budget.intro >= 120 && budget.intro <= 180,
  );
  check(
    'section-count helpers stay in range across 1300-1900 (list 8-12, single 4-6)',
    listIdeaCount(1300) >= 8 &&
      listIdeaCount(1300) <= 12 &&
      listIdeaCount(1500) >= 8 &&
      listIdeaCount(1900) <= 12 &&
      singleSectionCount(1300) >= 4 &&
      singleSectionCount(1900) <= 6,
  );
  check(
    'thin floor is 70% of target (1500 → 1050 minimum)',
    THIN_FLOOR_RATIO === 0.7 && Math.round(1500 * THIN_FLOOR_RATIO) === 1050,
  );

  // -------------------------------------------------------------------------
  console.log('\n[9] placeInternalLinks — auto-inserted links (P2-AI-002b)');
  const introText = 'Ordering custom water bottles in bulk pays off for trade shows.';
  const placement = placeInternalLinks(
    {
      intro: [introText],
      sections: [
        {
          heading: 'Custom Water Bottles Guide', // headings must never be linked
          headingLevel: 'h2',
          paragraphs: ['A totally unrelated paragraph about decoration methods.'],
        },
      ],
    },
    [
      {
        label: 'Custom Water Bottles',
        href: '/cat/water-bottles',
        kind: 'category',
        reason: 'Category page matching the keywords: water, bottles',
      },
      {
        label: 'Water Bottles Buying Guide',
        href: '/cat/water-bottles', // duplicate href → must not double-link
        kind: 'blog',
        reason: 'Existing blog post sharing the keywords: water, bottles',
      },
      {
        label: 'Quantum Flux Capacitors', // no anchor anywhere → skipped
        href: '/blog/quantum-flux',
        kind: 'blog',
        reason: 'Existing blog post sharing the keywords: quantum, flux',
      },
    ],
  );
  check(
    'places exactly one link (dupe href + unanchorable target skipped)',
    placement.placedHrefs.length === 1 && placement.placedHrefs[0] === '/cat/water-bottles',
    JSON.stringify(placement.placedHrefs),
  );
  const linkedIntro = placement.body.intro?.[0];
  const linkedSpans = Array.isArray(linkedIntro) ? (linkedIntro as BlogInlineSpan[]) : null;
  check(
    'matched run carries the link, original casing + full text preserved',
    !!linkedSpans &&
      linkedSpans.some((s) => s.link?.href === '/cat/water-bottles') &&
      linkedSpans.map((s) => s.text).join('') === introText,
  );
  const placedBody = buildBlogBody(placement.body);
  const placedText = placedBody.filter((b): b is BlogTextBlock => b._type === 'block');
  const linkedBlocks = placedText.filter((b) => b.markDefs.length > 0);
  check(
    'built body emits schema-exact link markDef referenced by a span mark',
    linkedBlocks.length === 1 &&
      linkedBlocks[0].markDefs[0]._type === 'link' &&
      linkedBlocks[0].markDefs[0].href === '/cat/water-bottles' &&
      linkedBlocks[0].markDefs[0].openInNewTab === false &&
      linkedBlocks[0].children.some((c) => c.marks.includes(linkedBlocks[0].markDefs[0]._key)),
  );
  check(
    'heading blocks carry no link markDefs',
    placedText.filter((b) => b.style === 'h2').every((b) => b.markDefs.length === 0),
  );

  // Same-paragraph second pass: only one paragraph, two targets → both placed.
  const twoInOne = placeInternalLinks(
    { intro: ['Order water bottles and tote bags in bulk today.'], sections: [] },
    [
      { label: 'Water Bottles', href: '/cat/water-bottles', kind: 'category', reason: 'k: water' },
      { label: 'Tote Bags', href: '/cat/tote-bags', kind: 'category', reason: 'k: tote' },
    ],
  );
  const twoSpans = Array.isArray(twoInOne.body.intro?.[0])
    ? (twoInOne.body.intro![0] as BlogInlineSpan[])
    : null;
  check(
    'second pass shares a paragraph when it is the only anchor spot (2 links, no overlap, text intact)',
    twoInOne.placedHrefs.length === 2 &&
      !!twoSpans &&
      twoSpans.filter((s) => s.link).length === 2 &&
      twoSpans.map((s) => s.text).join('') === 'Order water bottles and tote bags in bulk today.',
  );

  // Cap: 7 anchorable targets → at most 5 placed.
  const capWords = ['lanyards', 'keychains', 'sunglasses', 'notebooks', 'backpacks', 'umbrellas', 'coolers'];
  const capPlacement = placeInternalLinks(
    {
      intro: capWords.map((w) => `Great picks include branded ${w} for every event budget.`),
      sections: [],
    },
    capWords.map((w) => ({
      label: w[0].toUpperCase() + w.slice(1),
      href: `/cat/${w}`,
      kind: 'category' as const,
      reason: `k: ${w}`,
    })),
  );
  check('total placements capped at 5', capPlacement.placedHrefs.length === 5);

  // -------------------------------------------------------------------------
  console.log('\n[10] video engine (P2-AI-003) — richAnswer body + link shapes');

  // buildRichAnswerBody: plain paragraphs → normal blocks ONLY.
  const raPlain = buildRichAnswerBody(['para one', 'para two', '   ', '']);
  const raForbidden = raPlain.filter(
    (b) =>
      (b as { _type: string })._type !== 'block' ||
      b.style !== 'normal' ||
      'listItem' in b ||
      'level' in b ||
      b.children.some((c) => (c as { _type: string })._type !== 'span') ||
      b.markDefs.some((m) => (m as { _type: string })._type !== 'link'),
  );
  check(
    'buildRichAnswerBody emits ONLY normal blocks (no h2/h3/list/blogProducts/image, blanks dropped)',
    raPlain.length === 2 && raForbidden.length === 0,
    JSON.stringify(raForbidden),
  );
  const raKeys: string[] = [];
  for (const b of raPlain) {
    raKeys.push(b._key);
    for (const c of b.children) raKeys.push(c._key);
    for (const m of b.markDefs) raKeys.push(m._key);
  }
  check(
    `buildRichAnswerBody: unique non-empty _keys (${raKeys.length} keys), non-empty children`,
    new Set(raKeys).size === raKeys.length &&
      raKeys.every(Boolean) &&
      raPlain.every((b) => b.children.some((c) => c.text.trim().length > 0)),
  );

  // richAnswer-mode placement: same rules (dupe-href skip, unanchorable skip),
  // link objects carry href ONLY.
  const videoIntro = 'Ordering custom water bottles in bulk pays off for trade shows.';
  const raPlacement = placeInternalLinks(
    { intro: [videoIntro, 'A separate paragraph about branded tote bags for events.'], sections: [] },
    [
      {
        label: 'Custom Water Bottles',
        href: '/cat/water-bottles',
        kind: 'category',
        reason: 'Category page matching the keywords: water, bottles',
      },
      {
        label: 'Water Bottles Buying Guide',
        href: '/cat/water-bottles', // duplicate href → must not double-link
        kind: 'blog',
        reason: 'Existing blog post sharing the keywords: water, bottles',
      },
      {
        label: 'Quantum Flux Capacitors', // no anchor anywhere → skipped
        href: '/blog/quantum-flux',
        kind: 'blog',
        reason: 'Existing blog post sharing the keywords: quantum, flux',
      },
      {
        label: 'Tote Bags',
        href: '/cat/tote-bags',
        kind: 'category',
        reason: 'Category page matching the keywords: tote, bags',
      },
    ],
    5,
    { linkShape: 'richAnswer' },
  );
  check(
    'richAnswer mode: places 2 links (dupe href + unanchorable skipped), text intact',
    raPlacement.placedHrefs.length === 2 &&
      raPlacement.placedHrefs[0] === '/cat/water-bottles' &&
      raPlacement.placedHrefs[1] === '/cat/tote-bags' &&
      (raPlacement.body.intro ?? [])
        .map((p) => (typeof p === 'string' ? p : (p as BlogInlineSpan[]).map((s) => s.text).join('')))
        .join('|') === `${videoIntro}|A separate paragraph about branded tote bags for events.`,
    JSON.stringify(raPlacement.placedHrefs),
  );
  const raSpanLinks = (raPlacement.body.intro ?? [])
    .filter((p): p is BlogInlineSpan[] => Array.isArray(p))
    .flat()
    .filter((s) => s.link)
    .map((s) => s.link!);
  check(
    'richAnswer mode: placed span links carry href ONLY (no openInNewTab key)',
    raSpanLinks.length === 2 && raSpanLinks.every((l) => !('openInNewTab' in l)),
    JSON.stringify(raSpanLinks),
  );

  // The built richAnswer body: markDefs are {_type:'link', _key, href} with NO
  // openInNewTab key — the single biggest P2-AI-003 gotcha (Studio would
  // strip/flag the unknown field on the richAnswer link annotation).
  const raBody = buildRichAnswerBody(raPlacement.body.intro ?? []);
  const raMarkDefs = raBody.flatMap((b) => b.markDefs);
  check(
    'built richAnswer markDefs: {_type:link, href}, NO openInNewTab key, spans reference them',
    raMarkDefs.length === 2 &&
      raMarkDefs.every(
        (m) =>
          m._type === 'link' &&
          typeof m.href === 'string' &&
          !!m._key &&
          !('openInNewTab' in m) &&
          Object.keys(m).sort().join(',') === '_key,_type,href',
      ) &&
      raBody.every((b) => b.markDefs.every((m) => b.children.some((c) => c.marks.includes(m._key)))),
    JSON.stringify(raMarkDefs),
  );

  // Contrast: blog mode (default) still emits openInNewTab in the built markDef.
  const blogModePlacement = placeInternalLinks(
    { intro: [videoIntro], sections: [] },
    [
      {
        label: 'Custom Water Bottles',
        href: '/cat/water-bottles',
        kind: 'category',
        reason: 'Category page matching the keywords: water, bottles',
      },
    ],
  );
  const blogModeDefs = buildBlogBody(blogModePlacement.body)
    .filter((b): b is BlogTextBlock => b._type === 'block')
    .flatMap((b) => b.markDefs);
  check(
    'blog mode (default) still emits openInNewTab in the built markDef',
    blogModeDefs.length === 1 &&
      'openInNewTab' in blogModeDefs[0] &&
      blogModeDefs[0].openInNewTab === false,
    JSON.stringify(blogModeDefs),
  );

  // richAnswer mode: total placements still capped at 5.
  const raCapPlacement = placeInternalLinks(
    {
      intro: capWords.map((w) => `Great picks include branded ${w} for every event budget.`),
      sections: [],
    },
    capWords.map((w) => ({
      label: w[0].toUpperCase() + w.slice(1),
      href: `/cat/${w}`,
      kind: 'category' as const,
      reason: `k: ${w}`,
    })),
    5,
    { linkShape: 'richAnswer' },
  );
  check('richAnswer mode: total placements capped at 5', raCapPlacement.placedHrefs.length === 5);

  // Video-style related-products strip: keyword/productType-driven matching
  // (the video's Sanity category is a blogCategory, so matching never uses it).
  const videoStripCategory = resolveCategoryForKeywords('stainless steel water bottles');
  const videoStrip = await matchRelatedProducts({
    categorySlug: videoStripCategory ?? undefined,
    keywords: ['stainless steel water bottles'],
    limit: 8,
  });
  check(
    'video strip: returns relevant, sku-backed, deduped products within limit',
    videoStrip.length > 0 &&
      videoStrip.length <= 8 &&
      videoStrip.every((p) => catalogSkus.has(p.sku)) &&
      new Set(videoStrip.map((p) => p.sku)).size === videoStrip.length &&
      videoStrip.every((p) => /water|bottle|steel|stainless/i.test(`${p.name} ${p.brand ?? ''}`)),
    videoStrip.map((p) => p.name).join(' | '),
  );

  // -------------------------------------------------------------------------
  console.log('\n[11] page engine (P2-AI-004) — page body + link shape + productStrip');

  // buildPageBody: paragraphs + bullet list → page-portableBody-legal blocks.
  const pageBody = buildPageBody({
    paragraphs: [
      'Plain paragraph about custom water bottles.',
      [
        { text: 'Rich paragraph with ' },
        { text: 'bold', strong: true },
        { text: ' and a ' },
        { text: 'category link', link: { href: '/cat/water-bottles' } },
        { text: '.' },
      ],
      '   ',
    ],
    list: { kind: 'bullet', items: ['First point', 'Second point', ''] },
  });
  check(
    'buildPageBody: only block blocks, normal style, blanks dropped',
    pageBody.length === 4 &&
      pageBody.every((b) => b._type === 'block' && b.style === 'normal') &&
      pageBody.every((b) => b.children.some((c) => c.text.trim().length > 0)),
    JSON.stringify(pageBody.map((b) => b.style)),
  );
  const pageListBlocks = pageBody.filter((b) => b.listItem);
  check(
    'buildPageBody: list items carry listItem bullet + level 1',
    pageListBlocks.length === 2 &&
      pageListBlocks.every((b) => b.listItem === 'bullet' && b.level === 1),
  );
  const pageKeys: string[] = [];
  for (const b of pageBody) {
    pageKeys.push(b._key);
    for (const c of b.children) pageKeys.push(c._key);
    for (const m of b.markDefs) pageKeys.push(m._key);
  }
  check(
    `buildPageBody: unique non-empty _keys (${pageKeys.length} keys)`,
    new Set(pageKeys).size === pageKeys.length && pageKeys.every(Boolean),
  );
  // The single biggest P2-AI-004 gotcha: the page portableBody uses the DEFAULT
  // block-editor link annotation — markDefs must be {_type:'link', _key, href}
  // with NO openInNewTab key, or Studio strips/flags the unknown field.
  const pageMarkDefs = pageBody.flatMap((b) => b.markDefs);
  check(
    'buildPageBody markDefs: {_type:link, href}, NO openInNewTab key, spans reference them',
    pageMarkDefs.length === 1 &&
      pageMarkDefs.every(
        (m) =>
          m._type === 'link' &&
          typeof m.href === 'string' &&
          !!m._key &&
          !('openInNewTab' in m) &&
          Object.keys(m).sort().join(',') === '_key,_type,href',
      ) &&
      pageBody.every((b) => b.markDefs.every((m) => b.children.some((c) => c.marks.includes(m._key)))),
    JSON.stringify(pageMarkDefs),
  );
  check(
    'buildPageBody: strong decorator applied',
    pageBody.some((b) => b.children.some((c) => c.marks.includes('strong'))),
  );

  // 'page' link-shape mode: placed span links carry href ONLY (same as
  // richAnswer), and the blog default is unchanged.
  const pagePlacement = placeInternalLinks(
    {
      intro: [],
      sections: [
        {
          heading: 'Why Order Custom Water Bottles', // headings never linked
          paragraphs: ['Ordering custom water bottles in bulk pays off for trade shows.'],
        },
      ],
    },
    [
      {
        label: 'Custom Water Bottles',
        href: '/cat/water-bottles',
        kind: 'category',
        reason: 'Category page matching the keywords: water, bottles',
      },
      {
        label: 'Quantum Flux Capacitors', // no anchor anywhere → skipped
        href: '/blog/quantum-flux',
        kind: 'blog',
        reason: 'Existing blog post sharing the keywords: quantum, flux',
      },
    ],
    5,
    { linkShape: 'page' },
  );
  const pageSpanLinks = (pagePlacement.body.sections[0].paragraphs ?? [])
    .filter((p): p is BlogInlineSpan[] => Array.isArray(p))
    .flat()
    .filter((s) => s.link)
    .map((s) => s.link!);
  check(
    "'page' link-shape: 1 link placed (unanchorable skipped), span link carries href ONLY",
    pagePlacement.placedHrefs.length === 1 &&
      pagePlacement.placedHrefs[0] === '/cat/water-bottles' &&
      pageSpanLinks.length === 1 &&
      pageSpanLinks.every((l) => !('openInNewTab' in l)),
    JSON.stringify(pageSpanLinks),
  );
  const pagePlacedBody = buildPageBody({
    paragraphs: pagePlacement.body.sections[0].paragraphs ?? [],
  });
  const pagePlacedDefs = pagePlacedBody.flatMap((b) => b.markDefs);
  check(
    "'page' placement built through buildPageBody keeps href-only markDefs, text intact",
    pagePlacedDefs.length === 1 &&
      !('openInNewTab' in pagePlacedDefs[0]) &&
      pagePlacedBody[0].children.map((c) => c.text).join('') ===
        'Ordering custom water bottles in bulk pays off for trade shows.',
    JSON.stringify(pagePlacedDefs),
  );

  // Synthetic productStrip section — the exact shape the generate-page route
  // assembles and the page schema stores (products[] of blogProduct entries).
  const stripProducts = await matchRelatedProducts({
    categorySlug: resolveCategoryForKeywords('water bottles') ?? undefined,
    keywords: ['water bottles'],
    limit: 8,
  });
  const stripSection = {
    _type: 'productStrip',
    _key: 'strip-test-1',
    heading: 'Featured Custom Water Bottles',
    products: stripProducts.map((p, i) => ({
      _type: 'blogProduct',
      _key: `sku-test-${i}`,
      sku: p.sku,
    })),
    hidden: false,
  };
  check(
    'productStrip section: _type/_key + products[] of blogProduct entries with _key + real catalog sku',
    stripSection._type === 'productStrip' &&
      stripSection.products.length >= 2 &&
      stripSection.products.every(
        (p) => p._type === 'blogProduct' && !!p._key && catalogSkus.has(p.sku),
      ) &&
      new Set(stripSection.products.map((p) => p._key)).size === stripSection.products.length,
    JSON.stringify(stripSection.products.slice(0, 3)),
  );
  // Below the 2-product relevance floor the route omits the strip entirely.
  const pageNonsenseStrip = await matchRelatedProducts({
    keywords: ['xylophone submarines'],
    limit: 8,
  });
  check(
    'page strip floor: irrelevant keywords match < 2 products → strip would be omitted',
    pageNonsenseStrip.length < 2,
  );
  check(
    'page product match: relevant, sku-backed, deduped, within limit',
    stripProducts.length > 0 &&
      stripProducts.length <= 8 &&
      stripProducts.every((p) => catalogSkus.has(p.sku)) &&
      new Set(stripProducts.map((p) => p.sku)).size === stripProducts.length &&
      stripProducts.every((p) => /water|bottle/i.test(`${p.name} ${p.brand ?? ''}`)),
    stripProducts.map((p) => p.name).join(' | '),
  );

  // -------------------------------------------------------------------------
  console.log('\n[12] landing engine (P2-AI-005) — sectioned body + link kinds + landmarks');

  // buildPageSectionsBody: one body carrying multiple heading-led sections —
  // h2 heading blocks IN the body (unlike the page builder, where the heading
  // is a separate section field), normal paragraphs, bullet lists at level 1.
  const landingSectionsInput = [
    {
      heading: 'Options for Custom Beach Towels',
      paragraphs: [
        'Plain paragraph about custom beach towels.',
        [
          { text: 'Rich paragraph with a ' },
          { text: 'category link', link: { href: '/cat/beach-towels' } },
          { text: '.' },
        ],
      ],
      list: { kind: 'bullet' as const, items: ['Velour', 'Woven', ''] },
    },
    {
      heading: 'Ideas Around Destin Harbor',
      paragraphs: ['Local usage ideas paragraph.'],
    },
    { heading: '   ', paragraphs: ['Blank heading is dropped, paragraph kept.'] },
  ];
  const sectionedBody = buildPageSectionsBody(landingSectionsInput);
  const h2Blocks = sectionedBody.filter((b) => b.style === 'h2');
  check(
    'buildPageSectionsBody: h2 blocks emitted for each non-blank heading, in order',
    h2Blocks.length === 2 &&
      h2Blocks[0].children.map((c) => c.text).join('') === 'Options for Custom Beach Towels' &&
      h2Blocks[1].children.map((c) => c.text).join('') === 'Ideas Around Destin Harbor',
    JSON.stringify(h2Blocks.map((b) => b.children.map((c) => c.text).join(''))),
  );
  const sectionedList = sectionedBody.filter((b) => b.listItem);
  check(
    'buildPageSectionsBody: only block blocks (normal/h2), bullet list at level 1, blanks dropped',
    sectionedBody.every((b) => b._type === 'block' && ['normal', 'h2'].includes(b.style)) &&
      sectionedList.length === 2 &&
      sectionedList.every((b) => b.listItem === 'bullet' && b.level === 1) &&
      sectionedBody.every((b) => b.children.some((c) => c.text.trim().length > 0)),
  );
  const sectionedKeys: string[] = [];
  for (const b of sectionedBody) {
    sectionedKeys.push(b._key);
    for (const c of b.children) sectionedKeys.push(c._key);
    for (const m of b.markDefs) sectionedKeys.push(m._key);
  }
  check(
    `buildPageSectionsBody: unique non-empty _keys (${sectionedKeys.length} keys)`,
    new Set(sectionedKeys).size === sectionedKeys.length && sectionedKeys.every(Boolean),
  );
  const sectionedDefs = sectionedBody.flatMap((b) => b.markDefs);
  check(
    'buildPageSectionsBody: link markDefs are href-only (page shape), heading blocks carry none',
    sectionedDefs.length === 1 &&
      sectionedDefs.every(
        (m) => Object.keys(m).sort().join(',') === '_key,_type,href' && m._type === 'link',
      ) &&
      h2Blocks.every((b) => b.markDefs.length === 0),
    JSON.stringify(sectionedDefs),
  );

  // Extended internal-link interleave: landing + video kinds mix in with the
  // rest (this seeds the per-kind lists directly — the Sanity reads behind
  // suggestInternalLinks are exercised through the running generate routes).
  const seed = (
    kind: ScoredLinkSuggestion['kind'],
    label: string,
    href: string,
    score: number,
  ): ScoredLinkSuggestion => ({ kind, label, href, reason: `k: ${label}`, score });
  const interleaved = interleaveScoredSuggestions(
    [
      [seed('category', 'Beach Towels', '/cat/beach-towels', 3)],
      [seed('blog', 'Beach Towel Buying Guide', '/blog/beach-towel-buying-guide', 3)],
      [seed('page', 'Kitting Services', '/duplicate-slug', 2)],
      [seed('video', 'Custom Beach Towels Video', '/videos/custom-beach-towels', 3)],
      [
        seed('landing', 'Beach Towels Navarre FL', '/duplicate-slug', 3), // duped href → one survives
        seed('landing', 'Beach Towels Destin FL', '/beach-towels-destin-fl', 3),
      ],
    ],
    5,
  );
  const interleavedKinds = new Set(interleaved.map((s) => s.kind));
  check(
    'interleave: landing + video kinds both appear alongside category/blog/page',
    interleavedKinds.has('landing') && interleavedKinds.has('video') && interleavedKinds.has('category'),
    JSON.stringify([...interleavedKinds]),
  );
  check(
    'interleave: capped at limit, deduped by href, score field stripped',
    interleaved.length === 5 &&
      new Set(interleaved.map((s) => s.href)).size === 5 &&
      interleaved.every((s) => !('score' in s)),
    JSON.stringify(interleaved.map((s) => s.href)),
  );

  // Landmark-inclusion enforcement (Patrick's hard requirement): the route
  // rejects any generation missing a listed landmark.
  const destinLandmarks = [
    'Crab Island',
    'Henderson Beach State Park',
    'Destin Harbor',
    'HarborWalk Village',
    'Okaloosa County',
  ];
  const coveringText =
    'From crab island charters to events at HENDERSON   BEACH state park, businesses along Destin Harbor and HarborWalk Village — plus offices across Okaloosa County — order early.';
  check(
    'findMissingLandmarks: all present (case/whitespace tolerant) → empty',
    findMissingLandmarks(destinLandmarks, coveringText).length === 0,
    JSON.stringify(findMissingLandmarks(destinLandmarks, coveringText)),
  );
  const partialText = 'Only Crab Island and Destin Harbor get a mention here.';
  const missing = findMissingLandmarks(destinLandmarks, partialText);
  check(
    'findMissingLandmarks: dropped landmarks are reported (original casing), blanks ignored',
    missing.length === 3 &&
      missing.includes('Henderson Beach State Park') &&
      missing.includes('HarborWalk Village') &&
      missing.includes('Okaloosa County') &&
      findMissingLandmarks(['  ', ''], partialText).length === 0,
    JSON.stringify(missing),
  );
  check(
    'findMissingLandmarks: word-bounded — "Destin" is NOT satisfied by "destination"',
    findMissingLandmarks(['Destin'], 'Plan destination events all summer.').length === 1 &&
      findMissingLandmarks(['Destin'], 'Businesses across Destin order early.').length === 0,
  );
  check(
    'findMissingLandmarks: per-segment — a multi-word landmark never matches across two adjacent blocks',
    findMissingLandmarks(['Harbor Village'], ['boats along the Harbor', 'Village shops open late'])
      .length === 1 &&
      findMissingLandmarks(['Harbor Village'], ['boutiques at Harbor Village draw crowds'])
        .length === 0,
  );

  // Landing-style product strip: keyword-driven, sku-backed, relevance-floored
  // — and omitted below the 2-product floor (the route's STRIP_MIN_PRODUCTS).
  const landingCategory = resolveCategoryForKeywords('custom beach towels');
  const landingStrip = await matchRelatedProducts({
    categorySlug: landingCategory ?? undefined,
    keywords: ['custom beach towels', 'beach towels'],
    limit: 8,
  });
  check(
    'landing strip: relevant, sku-backed, deduped products within limit',
    landingStrip.length >= 2 &&
      landingStrip.length <= 8 &&
      landingStrip.every((p) => catalogSkus.has(p.sku)) &&
      new Set(landingStrip.map((p) => p.sku)).size === landingStrip.length &&
      landingStrip.every((p) => /towel|beach/i.test(`${p.name} ${p.brand ?? ''}`)),
    landingStrip.map((p) => p.name).join(' | '),
  );
  const landingNonsense = await matchRelatedProducts({
    keywords: ['xylophone submarines'],
    limit: 8,
  });
  check(
    'landing strip floor: irrelevant keywords match < 2 products → strip omitted',
    landingNonsense.length < 2,
  );

  // Synthetic landing generation payload — the exact field shapes the
  // generate-landing route returns and the landingPage schema stores: one
  // placement pass across localIntro + optionsIdeas + whyUs (page link shape),
  // split back on the same boundaries, three page-legal PT bodies, plain-text
  // faqs, keyed blogProduct strip entries.
  const landingGen = {
    localIntro: [
      'Businesses near Crab Island and Henderson Beach State Park order custom beach towels every spring.',
    ],
    optionsIdeas: [
      {
        heading: 'Beach Towel Options',
        paragraphs: ['Velour and woven custom beach towels both take full-color printing.'],
        listItems: ['Velour', 'Woven'],
      },
      {
        heading: 'Ideas for Destin Events',
        paragraphs: ['Hand branded tote bags and towels to charter guests along the harbor.'],
        listItems: [] as string[],
      },
    ],
    whyUs: ['Bulk ordering with free art proofs and fast turnaround for every event budget.'],
  };
  const landingPlacement = placeInternalLinks(
    {
      intro: landingGen.localIntro,
      sections: [
        ...landingGen.optionsIdeas.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })),
        { heading: 'Why Perfect Imprints', paragraphs: landingGen.whyUs },
      ],
    },
    [
      {
        label: 'Custom Beach Towels',
        href: '/cat/beach-towels',
        kind: 'category',
        reason: 'Category page matching the keywords: beach, towels',
      },
      {
        label: 'Tote Bags',
        href: '/cat/tote-bags',
        kind: 'category',
        reason: 'Category page matching the keywords: tote, bags',
      },
    ],
    5,
    { linkShape: 'page' },
  );
  const landingIntroBody = buildPageBody({ paragraphs: landingPlacement.body.intro ?? [] });
  const landingOptionsBody = buildPageSectionsBody(
    landingPlacement.body.sections.slice(0, landingGen.optionsIdeas.length).map((placed, i) => ({
      heading: landingGen.optionsIdeas[i].heading,
      paragraphs: placed.paragraphs ?? [],
      ...(landingGen.optionsIdeas[i].listItems.length > 0
        ? { list: { kind: 'bullet' as const, items: landingGen.optionsIdeas[i].listItems } }
        : {}),
    })),
  );
  const landingWhyUsBody = buildPageBody({
    paragraphs:
      landingPlacement.body.sections[landingGen.optionsIdeas.length]?.paragraphs ??
      landingGen.whyUs,
  });
  const landingBodies = [landingIntroBody, landingOptionsBody, landingWhyUsBody];
  const landingAllDefs = landingBodies.flat().flatMap((b) => b.markDefs);
  check(
    'landing bodies: links placed across intro + options + whyUs in one pass, all href-only',
    landingPlacement.placedHrefs.length === 2 &&
      landingAllDefs.length === 2 &&
      landingAllDefs.every(
        (m) => Object.keys(m).sort().join(',') === '_key,_type,href' && m._type === 'link',
      ),
    JSON.stringify({ placed: landingPlacement.placedHrefs, defs: landingAllDefs }),
  );
  check(
    'landing bodies: all three are page-legal PT (block-only, unique keys, no empty blocks); whyUs has NO headings (fixed H2 renders separately); optionsIdeas keeps its h2s',
    landingBodies.flat().every((b) => b._type === 'block') &&
      landingWhyUsBody.every((b) => b.style === 'normal') &&
      landingOptionsBody.filter((b) => b.style === 'h2').length === 2 &&
      (() => {
        const keys = landingBodies
          .flat()
          .flatMap((b) => [b._key, ...b.children.map((c) => c._key), ...b.markDefs.map((m) => m._key)]);
        return new Set(keys).size === keys.length && keys.every(Boolean);
      })() &&
      landingBodies.flat().every((b) => b.children.some((c) => c.text.trim().length > 0)),
  );
  const landingFaqs = [
    { question: 'What is the minimum order?', answer: 'Most custom beach towels start at 25 pieces.' },
  ].map((f, i) => ({ _key: `qa-test-${i}`, ...f }));
  const landingStripEntries = landingStrip.map((p, i) => ({
    _type: 'blogProduct',
    _key: `rp-test-${i}`,
    sku: p.sku,
  }));
  check(
    'landing field shapes: faqs are keyed plain-text q/a; relatedProducts are keyed blogProduct entries with real catalog SKUs',
    landingFaqs.every(
      (f) => typeof f.question === 'string' && typeof f.answer === 'string' && !!f._key,
    ) &&
      landingStripEntries.length >= 2 &&
      landingStripEntries.every(
        (p) => p._type === 'blogProduct' && !!p._key && catalogSkus.has(p.sku),
      ) &&
      new Set(landingStripEntries.map((p) => p._key)).size === landingStripEntries.length,
  );

  // -------------------------------------------------------------------------
  const total = passed + failed;
  console.log(`\n${passed}/${total} checks passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-blog-engine crashed:', err);
  process.exit(1);
});

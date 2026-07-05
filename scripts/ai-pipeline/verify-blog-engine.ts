/**
 * Offline verification harness for the Phase 2 AI blog engine (P2-AI-001/002).
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
 *
 * The Sanity-backed pieces (blog/page link suggestions, custom-product merge)
 * are guarded in the engine itself — offline they degrade gracefully, and they
 * are exercised end-to-end through the running /api/sanity/generate-blog route.
 *
 * Prints an X/Y summary; exits non-zero on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';

import { matchRelatedProducts, resolveCategoryForKeywords } from '../../lib/ai/related-products';
import { suggestCategoryLinks } from '../../lib/ai/internal-links';
import { placeInternalLinks } from '../../lib/ai/place-internal-links';
import {
  buildWordBudget,
  clampWordCount,
  listIdeaCount,
  singleSectionCount,
} from '../../lib/ai/word-budget';
import {
  buildBlogBody,
  type BlogBodyBlock,
  type BlogTextBlock,
  type BlogProductsBlock,
  type BlogInlineSpan,
} from '../../lib/portable-text/build-blog-body';
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
  console.log('\n[8] word-count budgeting (pure)');
  check(
    'clamps: 1000→1200, 3000→2400, undefined→1700',
    clampWordCount(1000) === 1200 && clampWordCount(3000) === 2400 && clampWordCount(undefined) === 1700,
  );
  const budget = buildWordBudget(1700, 10);
  const budgetSum = budget.intro + budget.sectionCount * budget.perSection;
  check(
    `budget sums to ~target (intro ${budget.intro} + 10×${budget.perSection} = ${budgetSum} ≈ 1700) with intro in 120-180`,
    Math.abs(budgetSum - 1700) <= 1700 * 0.02 && budget.intro >= 120 && budget.intro <= 180,
  );
  check(
    'section-count helpers stay in range (list 8-12, single 4-6)',
    listIdeaCount(1200) === 8 &&
      listIdeaCount(1700) === 10 &&
      listIdeaCount(2400) === 12 &&
      singleSectionCount(1200) >= 4 &&
      singleSectionCount(2400) <= 6,
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
  const total = passed + failed;
  console.log(`\n${passed}/${total} checks passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('verify-blog-engine crashed:', err);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * Category CTA audit — post-revert (M5-504 part 1).
 *
 * The exact-match-only Geiger-menu gate was reverted as too aggressive (it
 * flipped ~10,694 categories to CTA). This audit confirms the restored
 * behaviour: CTA is decided ONLY by the original three `shouldShowEmptyStateCTA`
 * rules — empty-skus, full-capped-60, and manual forceCTA — so categories with
 * real matched SKUs render their product grid again.
 *
 * Off-topic edge categories (dog-tags, PPE, etc.) are handled by targeted
 * `categoryOverride` docs (forceCTA / hiddenSkus), NOT a site-wide rule.
 *
 * Writes docs/category-rule-audit.md. Changes nothing.
 * Run: pnpm audit:category-rule
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  shouldShowEmptyStateCTA,
  type CategoryType,
  type GeneratedCategoryContent,
} from '../lib/categories';

const ROOT = process.cwd();
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');
const REPORT_PATH = path.join(ROOT, 'docs', 'category-rule-audit.md');

const TYPES: CategoryType[] = ['root', 'modifier', 'facet', 'compound-facet'];

type Rule = 'empty-skus' | 'full-capped-60' | 'force-cta' | 'has-products';

function classify(c: GeneratedCategoryContent): Rule {
  if (c.forceCTA === true) return 'force-cta';
  const skus = c.productSkus ?? [];
  if (skus.length === 0) return 'empty-skus';
  if (c.skuFilterMode === 'full-capped-60') return 'full-capped-60';
  return 'has-products';
}

function readAll(): GeneratedCategoryContent[] {
  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith('.json'));
  const out: GeneratedCategoryContent[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8');
    if (!raw.trim()) continue;
    try {
      const data = JSON.parse(raw) as GeneratedCategoryContent;
      if (data.url) out.push(data);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function main(): void {
  if (!fs.existsSync(CATEGORIES_DIR)) {
    console.error(`Categories dir not found: ${CATEGORIES_DIR}`);
    process.exit(1);
  }

  const contents = readAll();
  const total = contents.length;
  const ruleOf = new Map<GeneratedCategoryContent, Rule>();
  for (const c of contents) ruleOf.set(c, classify(c));

  const ctaCount = contents.filter((c) => shouldShowEmptyStateCTA(c)).length;
  const productCount = total - ctaCount;

  const ruleTotals: Record<Rule, number> = {
    'empty-skus': 0,
    'full-capped-60': 0,
    'force-cta': 0,
    'has-products': 0,
  };
  for (const r of ruleOf.values()) ruleTotals[r] += 1;

  // Spot-checks. `expected` = the desired outcome stated in the revert prompt;
  // `note` calls out where the automatic rules diverge (handled by an override).
  const expected: Record<string, 'products' | 'cta'> = {
    binoculars: 'products',
    'tote-bags': 'products',
    pens: 'products',
    'apparel-accessories': 'products',
    'water-bottles': 'products',
    backpacks: 'products',
    golf: 'products',
    'dog-tags': 'cta',
    'personal-protection-equipment': 'cta',
  };
  const bySlug = new Map(contents.map((c) => [c.url.replace(/^\/cat\//, ''), c]));

  const lines: string[] = [];
  lines.push('# Category CTA Audit (post-revert)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total category JSONs scanned: **${fmt(total)}**`);
  lines.push('');
  lines.push(
    'The exact-match-only Geiger-menu gate was **reverted** (it was too aggressive — ' +
      'it flipped ~10,694 categories to CTA, including genuine ones like binoculars / ' +
      'tote-bags / pens). CTA is again decided ONLY by the original three rules: ' +
      '`empty-skus`, `full-capped-60`, and manual `forceCTA`. Off-topic edge categories ' +
      'are fixed by targeted `categoryOverride` docs, not a site-wide rule.',
  );
  lines.push('');
  lines.push(
    `**${fmt(ctaCount)}** pages render the EmptyStateCTA (${((ctaCount / total) * 100).toFixed(1)}% of total).  `,
  );
  lines.push(`**${fmt(productCount)}** pages render a product grid.`);
  lines.push('');

  lines.push('## Breakdown by detection rule');
  lines.push('');
  lines.push('| Rule | Pages |');
  lines.push('| --- | ---: |');
  lines.push(`| \`empty-skus\` | ${fmt(ruleTotals['empty-skus'])} |`);
  lines.push(`| \`full-capped-60\` | ${fmt(ruleTotals['full-capped-60'])} |`);
  lines.push(`| \`force-cta\` | ${fmt(ruleTotals['force-cta'])} |`);
  lines.push(`| \`has-products\` (grid) | ${fmt(ruleTotals['has-products'])} |`);
  lines.push('');

  lines.push('## Totals by type');
  lines.push('');
  lines.push('| Type | Total | Products | CTA |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const t of TYPES) {
    const all = contents.filter((c) => c.type === t);
    const cta = all.filter((c) => shouldShowEmptyStateCTA(c)).length;
    lines.push(`| ${t} | ${fmt(all.length)} | ${fmt(all.length - cta)} | ${fmt(cta)} |`);
  }
  lines.push('');

  lines.push('## Spot-checks');
  lines.push('');
  lines.push('`expected` = the outcome the revert prompt wants. `actual` = what the restored automatic rules do. Mismatches are resolved with a `categoryOverride` (see Notes).');
  lines.push('');
  lines.push('| Slug | Expected | Actual | Rule | Match | Fix if mismatch |');
  lines.push('| --- | --- | --- | --- | :---: | --- |');
  for (const slug of Object.keys(expected)) {
    const c = bySlug.get(slug);
    if (!c) {
      lines.push(`| \`${slug}\` | ${expected[slug]} | _(no JSON)_ | — | — | — |`);
      continue;
    }
    const actual = shouldShowEmptyStateCTA(c) ? 'cta' : 'products';
    const rule = ruleOf.get(c)!;
    const match = actual === expected[slug] ? '✅' : '⚠️';
    let fix = '—';
    if (actual !== expected[slug]) {
      fix =
        expected[slug] === 'products'
          ? `set \`forceProducts\` (CTA via \`${rule}\`)`
          : 'set `forceCTA`';
    }
    lines.push(`| \`${slug}\` | ${expected[slug]} | ${actual} | \`${rule}\` | ${match} | ${fix} |`);
  }
  lines.push('');
  lines.push('### Notes');
  lines.push('');
  lines.push(
    '- `binoculars` and `pens` are CTA via the pre-existing `full-capped-60` rule ' +
      '(their slug-token filter failed, so the grid would be the top-60 of a broad ' +
      'parent department — likely off-topic), **not** the reverted Geiger-menu gate. ' +
      'Show products by setting `forceProducts` on a `categoryOverride`, or by ' +
      'relaxing the `full-capped-60` rule globally (affects ~65 roots — separate decision).',
  );
  lines.push(
    '- `dog-tags` and `personal-protection-equipment` have real matched SKUs, so they ' +
      'now render products. Make them CTA with a `forceCTA` override (expected, per the ' +
      'revert plan), or prune the off-topic SKUs with `hiddenSkus`.',
  );
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

  console.log('Category CTA audit (post-revert) complete.');
  console.log(`  Scanned:        ${fmt(total)}`);
  console.log(`  CTA:            ${fmt(ctaCount)} (${((ctaCount / total) * 100).toFixed(1)}%)`);
  console.log(`  Products:       ${fmt(productCount)}`);
  console.log(`  Rules: empty-skus ${ruleTotals['empty-skus']}  full-capped-60 ${ruleTotals['full-capped-60']}  force-cta ${ruleTotals['force-cta']}`);
  console.log('  Spot-checks (expected vs actual):');
  for (const slug of Object.keys(expected)) {
    const c = bySlug.get(slug);
    if (!c) {
      console.log(`    ${slug.padEnd(32)} no JSON`);
      continue;
    }
    const actual = shouldShowEmptyStateCTA(c) ? 'cta' : 'products';
    const flag = actual === expected[slug] ? 'ok' : `MISMATCH (rule=${ruleOf.get(c)})`;
    console.log(`    ${slug.padEnd(32)} expected=${expected[slug].padEnd(8)} actual=${actual.padEnd(8)} ${flag}`);
  }
  console.log(`  Report:         ${path.relative(ROOT, REPORT_PATH)}`);
}

main();

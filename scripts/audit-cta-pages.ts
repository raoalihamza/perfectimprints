/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');
const REPORT_PATH = path.join(ROOT, 'docs', 'cta-audit-report.md');

type CategoryType = 'root' | 'modifier' | 'facet' | 'compound-facet';

interface CategoryJson {
  url: string;
  type: CategoryType;
  productSkus?: string[];
  skuFilterMode?: string;
  rawSkuCount?: number;
  filteredSkuCount?: number;
  forceCTA?: boolean;
}

type Rule = 'empty-skus' | 'full-capped-60' | 'force-cta' | 'has-products';

interface Entry {
  url: string;
  type: CategoryType;
  rule: Rule;
  productCount: number;
  skuFilterMode?: string;
}

function classify(c: CategoryJson): Rule {
  if (c.forceCTA === true) return 'force-cta';
  const skus = c.productSkus ?? [];
  if (skus.length === 0) return 'empty-skus';
  if (c.skuFilterMode === 'full-capped-60') return 'full-capped-60';
  return 'has-products';
}

function readAll(): Entry[] {
  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith('.json'));
  const entries: Entry[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8');
    if (!raw.trim()) continue;
    let data: CategoryJson;
    try {
      data = JSON.parse(raw) as CategoryJson;
    } catch {
      continue;
    }
    if (!data.url) continue;
    entries.push({
      url: data.url,
      type: data.type,
      rule: classify(data),
      productCount: data.productSkus?.length ?? 0,
      skuFilterMode: data.skuFilterMode,
    });
  }
  return entries;
}

interface RuleSummary {
  rule: Rule;
  total: number;
  byType: Partial<Record<CategoryType, number>>;
  samples: Entry[];
}

function summarize(entries: Entry[]): RuleSummary[] {
  const rules: Rule[] = ['empty-skus', 'full-capped-60', 'force-cta', 'has-products'];
  return rules.map((rule) => {
    const matched = entries.filter((e) => e.rule === rule);
    const byType: Partial<Record<CategoryType, number>> = {};
    for (const m of matched) {
      byType[m.type] = (byType[m.type] ?? 0) + 1;
    }
    return {
      rule,
      total: matched.length,
      byType,
      samples: matched.slice(0, 15),
    };
  });
}

const RULE_DESCRIPTIONS: Record<Rule, string> = {
  'empty-skus': 'Zero SKUs in `productSkus` — Tier 3/4 fallback (no Geiger match).',
  'full-capped-60':
    'Slug-token filter failed; pipeline fell back to top-60 of parent department. Products likely off-topic.',
  'force-cta': 'Manually flagged with `forceCTA: true` in the JSON.',
  'has-products': 'Page renders the product grid (no CTA).',
};

function renderReport(summary: RuleSummary[], total: number): string {
  const lines: string[] = [];
  lines.push('# CTA Audit Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total category JSONs scanned: **${total.toLocaleString()}**`);
  lines.push('');
  const ctaTotal = summary
    .filter((s) => s.rule !== 'has-products')
    .reduce((sum, s) => sum + s.total, 0);
  const productTotal = summary.find((s) => s.rule === 'has-products')?.total ?? 0;
  const pct = total === 0 ? 0 : (ctaTotal / total) * 100;
  lines.push(
    `**${ctaTotal.toLocaleString()}** pages render the EmptyStateCTA (${pct.toFixed(1)}% of total).  `
  );
  lines.push(`**${productTotal.toLocaleString()}** pages render a product grid.`);
  lines.push('');
  lines.push('## Breakdown by detection rule');
  lines.push('');
  lines.push('| Rule | Pages | Description |');
  lines.push('| --- | ---: | --- |');
  for (const s of summary) {
    lines.push(`| \`${s.rule}\` | ${s.total.toLocaleString()} | ${RULE_DESCRIPTIONS[s.rule]} |`);
  }
  lines.push('');
  for (const s of summary) {
    if (s.rule === 'has-products') continue;
    lines.push(`## ${s.rule} (${s.total.toLocaleString()})`);
    lines.push('');
    lines.push(`${RULE_DESCRIPTIONS[s.rule]}`);
    lines.push('');
    if (s.total === 0) {
      lines.push('_No pages match._');
      lines.push('');
      continue;
    }
    lines.push('Breakdown by type:');
    lines.push('');
    for (const [type, count] of Object.entries(s.byType)) {
      lines.push(`- ${type}: ${count?.toLocaleString()}`);
    }
    lines.push('');
    lines.push('Sample URLs:');
    lines.push('');
    for (const sample of s.samples) {
      lines.push(`- \`${sample.url}\` (${sample.type}, ${sample.productCount} SKUs)`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(CATEGORIES_DIR)) {
    console.error(`Categories dir not found: ${CATEGORIES_DIR}`);
    process.exit(1);
  }
  const entries = readAll();
  const summary = summarize(entries);
  const report = renderReport(summary, entries.length);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log('CTA audit complete.');
  console.log(`Scanned ${entries.length} category JSONs.`);
  for (const s of summary) {
    console.log(`  ${s.rule.padEnd(18)} ${s.total}`);
  }
  console.log(`Report written: ${path.relative(ROOT, REPORT_PATH)}`);
}

main();

/**
 * Build-time category list for the Studio CategoryPicker (M5-504 Part 1).
 *
 *   pnpm build:category-list   (also runs in `prebuild`)
 *
 * The 22,180 category pages are build-time JSON, not Sanity docs, so a normal
 * reference field can't target them. This emits a lightweight slug+title list
 * the custom Studio picker fetches and filters client-side. Derived from
 * data/pi-urls/category-urls.json (no 22k file reads, no Sanity calls). The
 * picker additionally queries live `customCategory` slugs from Sanity, so this
 * file only needs the baked Geiger categories.
 *
 * Output: public/category-list.json — Studio-only; never loaded by the live site.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const URLS_FILE = path.join(ROOT, 'data', 'pi-urls', 'category-urls.json');
// Written to BOTH public/ (embedded Studio at /admin3773752) and sanity/static/
// (standalone `sanity dev` Studio, which doesn't serve Next's public/).
const OUTPUT_FILES = [
  path.join(ROOT, 'public', 'category-list.json'),
  path.join(ROOT, 'sanity', 'static', 'category-list.json'),
];

interface UrlEntry {
  url: string;
  type: 'root' | 'modifier' | 'facet' | 'compound-facet';
}
interface UrlsFile {
  urls: UrlEntry[];
}

function titleCase(segment: string): string {
  return segment
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** `/cat/water-bottles/color/blue` → { slug: "water-bottles/color/blue", title: "Water Bottles / Color / Blue" }. */
function toEntry(url: string): { slug: string; title: string } {
  const slug = url.replace(/^\/cat\//, '').replace(/^\//, '');
  const title = slug.split('/').map(titleCase).join(' / ');
  return { slug, title };
}

function main(): void {
  if (!fs.existsSync(URLS_FILE)) {
    console.error(`URL list not found: ${URLS_FILE}`);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8')) as UrlsFile;
  const seen = new Set<string>();
  const categories: { slug: string; title: string }[] = [];
  for (const u of parsed.urls) {
    if (!u.url?.startsWith('/cat/')) continue;
    const entry = toEntry(u.url);
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    categories.push(entry);
  }
  categories.sort((a, b) => a.slug.localeCompare(b.slug));

  const payload = { generatedAt: new Date().toISOString(), categories };
  const json = JSON.stringify(payload);
  for (const out of OUTPUT_FILES) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json, 'utf8');
  }

  const bytes = Buffer.byteLength(json, 'utf8');
  console.log(`Wrote category-list.json (public + sanity/static) — ${categories.length} categories (${(bytes / 1024).toFixed(0)} KB)`);
}

main();

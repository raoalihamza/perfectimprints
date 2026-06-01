import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PI_URLS_FILE = path.join(ROOT, 'data', 'pi-urls', 'category-urls.json');
const PI_MAPPINGS_FILE = path.join(ROOT, 'data', 'mappings', 'pi-to-geiger.json');
const PI_CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

interface PiUrlEntry {
  url: string;
  type: 'root' | 'modifier' | 'facet' | 'compound-facet';
  rootSlug: string;
}

interface PiUrlsFile {
  urls: PiUrlEntry[];
}

interface PiMappingEntry {
  geigerCategoryPath: string;
  geigerSlug: string;
  matchType: 'exact' | 'fuzzy' | 'override';
  confidence: number;
}

interface PiMappingsFile {
  mappings: Record<string, PiMappingEntry>;
}

export interface NavNode {
  label: string;
  href: string | null;
  available: boolean;
  children: NavNode[];
}

export interface NavDepartment {
  label: string;
  slug: string;
  href: string | null;
  available: boolean;
  children: NavNode[];
}

// Visual column order in the mega menu, derived from Geiger's top-level
// departments. Patrick wanted the structure to mirror Geiger; the *items* under
// each column come from PI's own slug universe. `headerPiSlug` (optional) is
// the PI root that should serve as the column-header landing page — null when
// PI doesn't have a department-level root (header stays non-clickable).
const DEPARTMENT_ORDER: {
  geigerTopLevel: string;
  label: string;
  slug: string;
  headerPiSlug: string | null;
}[] = [
  { geigerTopLevel: 'Apparel', label: 'Apparel', slug: 'apparel', headerPiSlug: 'apparel' },
  { geigerTopLevel: 'Bags & Totes', label: 'Bags & Totes', slug: 'bags-and-totes', headerPiSlug: 'bags' },
  { geigerTopLevel: 'Drinkware', label: 'Drinkware', slug: 'drinkware', headerPiSlug: 'drinkware' },
  { geigerTopLevel: 'Health & Wellness', label: 'Health & Wellness', slug: 'health-and-wellness', headerPiSlug: 'health' },
  { geigerTopLevel: 'Home & Auto', label: 'Home & Auto', slug: 'home-and-auto', headerPiSlug: 'household' },
  { geigerTopLevel: 'Office & Technology', label: 'Office & Technology', slug: 'office-and-technology', headerPiSlug: 'office' },
  { geigerTopLevel: 'Sports & Outdoor', label: 'Sports & Outdoor', slug: 'sports-and-outdoor', headerPiSlug: 'outdoor' },
  { geigerTopLevel: 'Tradeshow & Events', label: 'Tradeshow & Events', slug: 'tradeshow-and-events', headerPiSlug: null },
  { geigerTopLevel: 'Writing Instruments', label: 'Writing Instruments', slug: 'writing-instruments', headerPiSlug: 'writing' },
  { geigerTopLevel: 'Shop By', label: 'Shop By', slug: 'shop-by', headerPiSlug: 'products' },
];

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

function topLevelOfPath(geigerPath: string): string {
  // 'Home > Apparel > Outerwear' -> 'Apparel'
  const parts = geigerPath.split(' > ');
  return parts[1] ?? parts[0] ?? '';
}

let _cache: NavDepartment[] | null = null;

function buildDepartments(): NavDepartment[] {
  const urlsFile = JSON.parse(fs.readFileSync(PI_URLS_FILE, 'utf8')) as PiUrlsFile;
  const mappings = (
    JSON.parse(fs.readFileSync(PI_MAPPINGS_FILE, 'utf8')) as PiMappingsFile
  ).mappings;

  // SKU presence check — does PI actually have a JSON content file for this
  // root? Should be all 465 in steady state, but the check protects against
  // partial runs.
  const generatedRoots = new Set<string>();
  if (fs.existsSync(PI_CATEGORIES_DIR)) {
    for (const file of fs.readdirSync(PI_CATEGORIES_DIR)) {
      if (file.endsWith('.json') && !file.includes('__')) {
        generatedRoots.add(file.replace(/\.json$/, ''));
      }
    }
  }

  // Group PI root slugs by their mapped Geiger top-level department. Anything
  // that doesn't fall under one of the named departments (e.g. roots overridden
  // to "All Products") falls into "Shop By" as a catch-all.
  const knownDepts = new Set(DEPARTMENT_ORDER.map((d) => d.geigerTopLevel));
  const piRoots = urlsFile.urls.filter((u) => u.type === 'root').map((u) => u.rootSlug);
  const byDept = new Map<string, string[]>();
  for (const piSlug of piRoots) {
    const mapping = mappings[piSlug];
    if (!mapping) continue;
    let dept = topLevelOfPath(mapping.geigerCategoryPath);
    if (!knownDepts.has(dept)) dept = 'Shop By';
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(piSlug);
  }

  const out: NavDepartment[] = [];
  for (const dept of DEPARTMENT_ORDER) {
    const piSlugs = (byDept.get(dept.geigerTopLevel) ?? []).slice().sort();
    const children: NavNode[] = piSlugs.map((piSlug) => {
      const has = generatedRoots.has(piSlug);
      return {
        label: titleCaseFromSlug(piSlug),
        href: has ? `/cat/${piSlug}` : null,
        available: has,
        children: [],
      };
    });
    const headerOk = dept.headerPiSlug !== null && generatedRoots.has(dept.headerPiSlug);
    out.push({
      label: dept.label,
      slug: dept.slug,
      href: headerOk ? `/cat/${dept.headerPiSlug}` : null,
      available: headerOk,
      children,
    });
  }
  return out;
}

export function getDepartments(): NavDepartment[] {
  if (_cache) return _cache;
  _cache = buildDepartments();
  return _cache;
}

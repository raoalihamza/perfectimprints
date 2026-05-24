import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATEGORIES_TREE_FILE = path.join(ROOT, 'data', 'geiger', 'categories.json');
const PI_CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

interface GeigerNode {
  name: string;
  slug: string;
  href: string;
  categoryPath: string;
  children: GeigerNode[];
}

interface GeigerTreeFile {
  tree: GeigerNode[];
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

const PRIMARY_DEPARTMENT_SLUGS = [
  'apparel',
  'bags-and-totes',
  'drinkware',
  'health-and-wellness',
  'home-and-auto',
  'office-and-technology',
  'sports-and-outdoor',
  'tradeshow-and-events',
  'writing-instruments',
  'shop-by',
];

let _generatedSlugs: Set<string> | null = null;

function loadGeneratedSlugs(): Set<string> {
  if (_generatedSlugs) return _generatedSlugs;
  const set = new Set<string>();
  if (fs.existsSync(PI_CATEGORIES_DIR)) {
    for (const file of fs.readdirSync(PI_CATEGORIES_DIR)) {
      if (file.endsWith('.json') && !file.includes('__')) {
        set.add(file.replace(/\.json$/, ''));
      }
    }
  }
  _generatedSlugs = set;
  return set;
}

function resolveHref(slug: string): { href: string | null; available: boolean } {
  const generated = loadGeneratedSlugs();
  if (generated.has(slug)) {
    return { href: `/cat/${slug}`, available: true };
  }
  return { href: null, available: false };
}

function toNavNode(node: GeigerNode): NavNode {
  const { href, available } = resolveHref(node.slug);
  return {
    label: node.name,
    href,
    available,
    children: node.children.map(toNavNode),
  };
}

let _tree: GeigerNode[] | null = null;

function loadTree(): GeigerNode[] {
  if (_tree) return _tree;
  const raw = fs.readFileSync(CATEGORIES_TREE_FILE, 'utf8');
  _tree = (JSON.parse(raw) as GeigerTreeFile).tree;
  return _tree;
}

export function getDepartments(): NavDepartment[] {
  const tree = loadTree();
  const bySlug = new Map(tree.map((n) => [n.slug, n]));
  const out: NavDepartment[] = [];
  for (const slug of PRIMARY_DEPARTMENT_SLUGS) {
    const node = bySlug.get(slug);
    if (!node) continue;
    const resolved = resolveHref(node.slug);
    out.push({
      label: node.name,
      slug: node.slug,
      href: resolved.href,
      available: resolved.available,
      children: node.children.map(toNavNode),
    });
  }
  return out;
}

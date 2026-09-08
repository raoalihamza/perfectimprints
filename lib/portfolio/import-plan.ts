/**
 * The pure half of the portfolio import (PORT-141).
 *
 * scripts/seed/import-portfolio-items.ts reads Patrick's reviewed metadata
 * file (PORT-140), uploads each photograph to Sanity and creates one
 * `portfolioItem` per record plus one published `portfolioCategory` per
 * folder. Everything that can be decided WITHOUT a network or a filesystem
 * lives here so it can be unit tested: what a valid record is, what a
 * document id is, what the category documents look like, which images need
 * far from square (informational since PORT-150), and which flags the script
 * accepts.
 *
 * Nothing here talks to Sanity. The script binds these decisions to the
 * shared write client (lib/sanity/write-client.ts) and to `fs`.
 */
import { isPortfolioColor, PORTFOLIO_COLORS } from './colors';
import { isPortfolioDecorationMethod, PORTFOLIO_DECORATION_METHODS } from './decoration-methods';
import { isPortfolioIndustry, PORTFOLIO_INDUSTRIES } from './industries';
import { slugify } from '../utils';

/** One object in portfolio-metadata-final.json, as PORT-140 wrote it. */
export interface PortfolioImportRecord {
  sourcePath: string;
  filename: string;
  category: string;
  title: string;
  alt: string;
  description: string;
  colors: string[];
  /**
   * PORT-160, OPTIONAL: how the work was decorated, values from
   * lib/portfolio/decoration-methods.ts. Absent, null or empty imports as no
   * value, so a metadata file written before PORT-160 still imports.
   */
  decorationMethods?: string[] | null;
  /** PORT-160, OPTIONAL: one value from lib/portfolio/industries.ts, or absent / null / empty. */
  industry?: string | null;
  clientName?: string;
  featured: boolean;
  displayOrder: number;
  hidden: boolean;
  needsReview: boolean;
  reviewNote: string;
  widthPx: number;
  heightPx: number;
  fileSizeKb: number;
}

/**
 * The four folders Patrick sorted the photographs into, in the order the
 * gallery's filter buttons should read. T-Shirts, Caps and Hats and Drinkware
 * follow the order of the list he agreed in PORT-000 (T-shirts, Caps and Hats,
 * Drinkware, Bags, Outerwear, Signs and Banners, Other); Christmas Ornaments
 * was not on that list, so it goes last. Patrick can renumber in Studio.
 */
export const PORTFOLIO_IMPORT_CATEGORIES: readonly { title: string; displayOrder: number }[] = [
  { title: 'T-Shirts', displayOrder: 10 },
  { title: 'Caps and Hats', displayOrder: 20 },
  { title: 'Drinkware', displayOrder: 30 },
  { title: 'Christmas Ornaments', displayOrder: 40 },
];

const CATEGORY_TITLES: ReadonlySet<string> = new Set(PORTFOLIO_IMPORT_CATEGORIES.map((c) => c.title));

/** Schema limits, mirrored so a record that Studio would refuse is refused here first. */
export const ALT_MAX = 160;
export const DESCRIPTION_MAX = 400;
export const CLIENT_NAME_MAX = 120;

/**
 * `portfolioCategory-<slug>`: the same slug the document carries, so the id
 * can be read in Studio's URL bar and a second run finds the same document.
 */
export function categorySlug(title: string): string {
  return slugify(title);
}

export function categoryDocId(title: string): string {
  return `portfolioCategory-${categorySlug(title)}`;
}

/**
 * `portfolioItem-<normalised filename>`. Deterministic from the FILENAME, so
 * the same file always maps to the same document and a re-run cannot create a
 * second copy. The filename is lower-cased and every run of characters
 * outside [a-z0-9] becomes one dash (Apple's screenshot names carry spaces, a
 * narrow no-break space before "AM", dots and colons); the extension is kept
 * so `photo.png` and `photo.jpg` stay distinct. Renaming a source file
 * therefore changes its id, which validation reports as a would-be duplicate
 * only if the new name collides; otherwise the renamed file imports as a NEW
 * item next to the old one, and the old one has to be deleted in Studio.
 */
export function itemDocId(filename: string): string {
  const normalised = filename
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `portfolioItem-${normalised}`;
}

export function draftId(publishedId: string): string {
  return publishedId.startsWith('drafts.') ? publishedId : `drafts.${publishedId}`;
}

export interface ValidationResult {
  ok: boolean;
  /** One line per problem, prefixed with the offending filename (or the index when there is none). */
  errors: string[];
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function nonBlank(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Every record is checked before anything is uploaded; one failure means the
 * script imports nothing (a partial gallery is harder to reason about than an
 * empty one). `fileExists` is injected so the rule can be tested without a
 * filesystem.
 */
export function validateImportRecords(
  records: unknown,
  fileExists: (path: string) => boolean,
): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(records)) {
    return { ok: false, errors: ['The metadata file must be a JSON array of records.'] };
  }
  if (records.length === 0) {
    return { ok: false, errors: ['The metadata file holds no records.'] };
  }

  const seenIds = new Map<string, string>();
  const seenFiles = new Set<string>();

  records.forEach((raw, index) => {
    const r = (raw ?? {}) as Partial<PortfolioImportRecord>;
    const label = nonBlank(r.filename) ? r.filename : `record #${index + 1}`;
    const fail = (msg: string) => errors.push(`${label}: ${msg}`);

    if (!nonBlank(r.filename)) fail('missing filename');
    if (!nonBlank(r.sourcePath)) fail('missing sourcePath');
    else if (!fileExists(r.sourcePath)) fail(`sourcePath does not exist on disk: ${r.sourcePath}`);
    if (!nonBlank(r.title)) fail('missing title');
    if (!nonBlank(r.alt)) fail('missing alt (required on the image by the schema)');
    else if (r.alt.length > ALT_MAX) fail(`alt is ${r.alt.length} characters; the schema allows ${ALT_MAX}`);
    if (!nonBlank(r.category)) fail('missing category');
    else if (!CATEGORY_TITLES.has(r.category)) {
      fail(`category "${r.category}" is not one of: ${[...CATEGORY_TITLES].join(', ')}`);
    }
    if (!Array.isArray(r.colors)) fail('colors must be an array');
    else {
      const bad = r.colors.filter((c) => !isPortfolioColor(c));
      if (bad.length > 0) {
        fail(`colors not in the vocabulary: ${bad.map(String).join(', ')} (allowed: ${PORTFOLIO_COLORS.join(', ')})`);
      }
      if (new Set(r.colors).size !== r.colors.length) fail('colors holds a duplicate value');
    }
    // PORT-160: both optional. A record without them (the pre-PORT-160 file
    // shape) passes; a record that has them must use the vocabulary.
    if (r.decorationMethods !== undefined && r.decorationMethods !== null) {
      if (!Array.isArray(r.decorationMethods)) fail('decorationMethods must be an array (or left out)');
      else {
        const bad = r.decorationMethods.filter((m) => !isPortfolioDecorationMethod(m));
        if (bad.length > 0) {
          fail(`decorationMethods not in the vocabulary: ${bad.map(String).join(', ')} (allowed: ${PORTFOLIO_DECORATION_METHODS.join(', ')})`);
        }
        if (new Set(r.decorationMethods).size !== r.decorationMethods.length) fail('decorationMethods holds a duplicate value');
      }
    }
    if (r.industry !== undefined && r.industry !== null && r.industry !== '') {
      if (typeof r.industry !== 'string') fail('industry must be a single string (or left out)');
      else if (!isPortfolioIndustry(r.industry)) {
        fail(`industry "${r.industry}" is not in the vocabulary (allowed: ${PORTFOLIO_INDUSTRIES.join(', ')})`);
      }
    }
    if (typeof r.description !== 'string') fail('description must be a string (empty is fine)');
    else if (r.description.length > DESCRIPTION_MAX) {
      fail(`description is ${r.description.length} characters; the schema allows ${DESCRIPTION_MAX}`);
    }
    if (r.clientName !== undefined && r.clientName !== null) {
      if (typeof r.clientName !== 'string') fail('clientName must be a string');
      else if (r.clientName.length > CLIENT_NAME_MAX) fail(`clientName is longer than ${CLIENT_NAME_MAX}`);
    }
    if (!isBool(r.featured)) fail('featured must be true or false');
    if (!isBool(r.hidden)) fail('hidden must be true or false');
    if (!isBool(r.needsReview)) fail('needsReview must be true or false');
    if (!Number.isInteger(r.displayOrder)) fail('displayOrder must be an integer');
    if (!(Number.isFinite(r.widthPx) && Number.isFinite(r.heightPx) && (r.widthPx as number) > 0 && (r.heightPx as number) > 0)) {
      fail('widthPx and heightPx must be positive numbers');
    }

    if (nonBlank(r.filename)) {
      if (seenFiles.has(r.filename)) fail('filename appears more than once');
      seenFiles.add(r.filename);
      const id = itemDocId(r.filename);
      const other = seenIds.get(id);
      if (other && other !== r.filename) fail(`document id ${id} collides with "${other}"`);
      seenIds.set(id, r.filename);
    }
  });

  return { ok: errors.length === 0, errors };
}

/** The published `portfolioCategory` document for one folder. */
export function buildCategoryDoc(title: string, displayOrder: number): Record<string, unknown> {
  return {
    _id: categoryDocId(title),
    _type: 'portfolioCategory',
    title,
    slug: { _type: 'slug', current: categorySlug(title) },
    displayOrder,
    hidden: false,
  };
}

/**
 * The `portfolioItem` document for one record, once its image asset exists.
 * Every value is copied from the record; nothing is invented. `clientName` is
 * never set (Patrick has not asked his customers about being named, PORT-140),
 * `slug` is left unset (used by no route, PORT-100), and an empty description
 * is omitted rather than stored as "". `decorationMethods` and `industry`
 * (PORT-160) are written only when the record carries a value, so a record
 * without them yields exactly the document PORT-141 wrote.
 */
export function buildItemDoc(
  record: PortfolioImportRecord,
  assetId: string,
  categoryId: string,
  id: string,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: id,
    _type: 'portfolioItem',
    title: record.title,
    image: {
      _type: 'image',
      asset: { _type: 'reference', _ref: assetId },
      alt: record.alt,
    },
    category: { _type: 'reference', _ref: categoryId },
    colors: [...record.colors],
    featured: record.featured === true,
    displayOrder: record.displayOrder,
    hidden: record.hidden === true,
  };
  if (record.description.trim()) doc.description = record.description;
  if (Array.isArray(record.decorationMethods) && record.decorationMethods.length > 0) {
    doc.decorationMethods = [...record.decorationMethods];
  }
  if (typeof record.industry === 'string' && record.industry.trim()) doc.industry = record.industry;
  return doc;
}

export interface HotspotCandidate {
  title: string;
  filename: string;
  category: string;
  widthPx: number;
  heightPx: number;
  /** Long side over short side, to two decimals. 1.00 is square. */
  ratio: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

/**
 * Items whose photograph is far from square: long side over short side at or
 * above the threshold. Under PORT-141 this was the list of hotspots to set by
 * hand, because the tile was a square crop and at 1.25 a centre crop already
 * discarded a fifth of the long side. Since PORT-150 the tile shows the WHOLE
 * image, so nothing needs doing for these; the dry run still prints them as
 * information (they are the tiles that sit smallest inside their box). The
 * name is kept so the tests and the script keep reading.
 */
export const HOTSPOT_RATIO_THRESHOLD = 1.25;

export function hotspotCandidates(
  records: readonly PortfolioImportRecord[],
  threshold = HOTSPOT_RATIO_THRESHOLD,
): HotspotCandidate[] {
  return records
    .map((r) => {
      const long = Math.max(r.widthPx, r.heightPx);
      const short = Math.min(r.widthPx, r.heightPx);
      const ratio = Math.round((long / short) * 100) / 100;
      const orientation: HotspotCandidate['orientation'] =
        r.widthPx === r.heightPx ? 'square' : r.heightPx > r.widthPx ? 'portrait' : 'landscape';
      return { title: r.title, filename: r.filename, category: r.category, widthPx: r.widthPx, heightPx: r.heightPx, ratio, orientation };
    })
    .filter((c) => c.ratio >= threshold)
    .sort((a, b) => b.ratio - a.ratio || a.title.localeCompare(b.title));
}

export function flaggedForReview(records: readonly PortfolioImportRecord[]): PortfolioImportRecord[] {
  return records.filter((r) => r.needsReview === true);
}

export interface ImportArgs {
  mode: 'dry-run' | 'write';
  /** Create drafts (and the published categories). */
  commit: boolean;
  /** Publish the drafts that exist (and ensure the published categories). */
  publish: boolean;
  file: string | null;
}

/**
 * No flag means dry run. `--commit` and `--publish` are the ONLY ways to
 * write, and `--dry-run` wins over both if someone types all three, so a
 * command line that mentions dry run can never write.
 */
export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const has = (flag: string) => argv.includes(flag);
  const fileIndex = argv.findIndex((a) => a === '--file');
  const file = fileIndex >= 0 ? (argv[fileIndex + 1] ?? null) : null;
  const dry = has('--dry-run');
  const commit = !dry && has('--commit');
  const publish = !dry && has('--publish');
  return {
    mode: commit || publish ? 'write' : 'dry-run',
    commit,
    publish,
    file: file && !file.startsWith('--') ? file : null,
  };
}

/** Bytes, from the measured file sizes, for the dry run's total. */
export function totalUploadKb(records: readonly PortfolioImportRecord[]): number {
  return records.reduce((sum, r) => sum + (Number.isFinite(r.fileSizeKb) ? r.fileSizeKb : 0), 0);
}

/** Content type for the upload, from the extension; the two the source folder holds. */
export function contentTypeFor(filename: string): 'image/png' | 'image/jpeg' | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return null;
}

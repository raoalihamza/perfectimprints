/**
 * Bulk Product Page import — spreadsheet parser (P2-CP-003).
 *
 * Turns an uploaded CSV / Excel file into typed `ParsedRow`s plus per-row
 * diagnostics, following the documented column template (see
 * public/templates/product-pages-template.csv and the Studio guide).
 *
 * PURE parsing only — no network, no Sanity, no fs. Image cells are validated
 * for URL SHAPE here; the actual fetch + asset upload happens in the apply step
 * of app/api/sanity/bulk-import/route.ts. Uses SheetJS (`xlsx`), which reads
 * both .xlsx workbooks and .csv byte buffers (BOM, quoted commas, and newlines
 * inside quoted cells are handled by the library).
 *
 * Rules implemented (confirmed scope):
 *  - Title is the only required column; a blank cell means "do not set".
 *  - Headers match the canonical template (trim + case-insensitive); unknown
 *    columns are reported as warnings, never silently dropped.
 *  - Multi-value fields use numbered columns (Size 1…, Tier 1 Qty/Price…,
 *    Decoration 1 (+ Upcharge), Image 1…, Color 1 Name/Images/Swatch…).
 *  - Upsert key is the slug (explicit `Slug` column, else slugified Title).
 *  - Max 50 data rows per upload.
 */

import * as XLSX from 'xlsx';
import { slugify } from '../utils';

// ── Limits ────────────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 50;
export const MAX_TIERS = 5;
export const MAX_SIZES = 10;
export const MAX_DECORATIONS = 10;
export const MAX_IMAGES = 10; // default images AND images per color variant
export const MAX_COLORS = 10;

// ── Parsed shapes ─────────────────────────────────────────────────────────────

export interface ParsedTier {
  minQty: number;
  price: number;
}

export interface ParsedDecoration {
  method: string;
  upcharge?: number;
}

export interface ParsedColorVariant {
  colorName: string;
  swatchHex?: string;
  imageUrls: string[];
}

/** Only the columns that actually had a value are present (never overwrite with blank). */
export interface ParsedFields {
  brand?: string;
  sku?: string;
  /** Plain text; converted to Portable Text (paragraph blocks) at apply time. */
  descriptionText?: string;
  onSale?: boolean;
  salePercentOff?: number;
  minQty?: number;
  setupCharge?: number;
  productionTime?: number;
  showInNewProducts?: boolean;
  leadRecipient?: string;
  relatedCategorySlug?: string;
  addToCategories?: string[];
  relatedKeywords?: string[];
  material?: string;
  features?: string[];
  types?: string[];
  madeInUsa?: boolean;
  ecoFriendly?: boolean;
  closeout?: boolean;
  unitsPerCarton?: number;
  cartonWeight?: number;
  cartonWidth?: number;
  cartonHeight?: number;
  cartonDepth?: number;
  fobZip?: string;
  fobCity?: string;
  fobState?: string;
  sizes?: string[];
  pricingTiers?: ParsedTier[];
  decorationMethods?: ParsedDecoration[];
  defaultImageUrls?: string[];
  colorVariants?: ParsedColorVariant[];
}

export interface ParsedRow {
  /** Spreadsheet row number (header is row 1, first data row is 2). */
  rowNumber: number;
  title: string;
  slug: string;
  fields: ParsedFields;
  /** Row-level blockers — a row with errors is never imported. */
  errors: string[];
  /** Non-blocking notices (skipped tier, unknown category slug, …). */
  warnings: string[];
}

export interface BulkParseResult {
  /** False when the FILE itself is unusable (no header, too many rows, …). */
  ok: boolean;
  fileErrors: string[];
  /** Headings we did not recognize (typos show up here instead of vanishing). */
  unknownColumns: string[];
  rows: ParsedRow[];
}

// ── Canonical headers ─────────────────────────────────────────────────────────

const SINGLE_COLUMNS = [
  'title',
  'slug',
  'brand',
  'item sku',
  'description',
  'min qty',
  'setup charge',
  'on sale',
  'sale percent off',
  'production time',
  'show in new products',
  'lead recipient',
  'related category',
  'add to categories',
  'related keywords',
  'material',
  'features',
  'types',
  'made in usa',
  'eco friendly',
  'closeout',
  'units per carton',
  'carton weight',
  'carton width',
  'carton height',
  'carton depth',
  'fob zip',
  'fob city',
  'fob state',
] as const;

type SingleKey = (typeof SINGLE_COLUMNS)[number];

interface NumberedRef {
  group: 'size' | 'tierQty' | 'tierPrice' | 'decoration' | 'decorationUpcharge' | 'image' | 'colorName' | 'colorImages' | 'colorSwatch';
  n: number;
}

type ColumnRef = { kind: 'single'; key: SingleKey } | { kind: 'numbered'; ref: NumberedRef } | { kind: 'unknown' };

const NUMBERED_PATTERNS: Array<{ re: RegExp; group: NumberedRef['group'] }> = [
  { re: /^size (\d+)$/, group: 'size' },
  { re: /^tier (\d+) qty$/, group: 'tierQty' },
  { re: /^tier (\d+) price$/, group: 'tierPrice' },
  { re: /^decoration (\d+) upcharge$/, group: 'decorationUpcharge' },
  { re: /^decoration (\d+)$/, group: 'decoration' },
  { re: /^image (\d+)$/, group: 'image' },
  { re: /^color (\d+) name$/, group: 'colorName' },
  { re: /^color (\d+) images$/, group: 'colorImages' },
  { re: /^color (\d+) swatch$/, group: 'colorSwatch' },
];

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, '') // BOM on the first header of a UTF-8 CSV
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function classifyHeader(raw: string): ColumnRef {
  const norm = normalizeHeader(raw);
  if ((SINGLE_COLUMNS as readonly string[]).includes(norm)) {
    return { kind: 'single', key: norm as SingleKey };
  }
  for (const { re, group } of NUMBERED_PATTERNS) {
    const m = norm.match(re);
    if (m) return { kind: 'numbered', ref: { group, n: Number(m[1]) } };
  }
  return { kind: 'unknown' };
}

// ── Cell coercion helpers ─────────────────────────────────────────────────────

function cellString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** yes/no cell → boolean; blank → undefined; anything else → null (invalid). */
export function parseYesNo(raw: string): boolean | undefined | null {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (['yes', 'y', 'true', '1', 'x'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return null;
}

/** Number cell (tolerates $ and thousands separators); blank → undefined; invalid → null. */
export function parseNumberCell(raw: string): number | undefined | null {
  const v = raw.trim();
  if (!v) return undefined;
  const cleaned = v.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Comma-separated list cell → trimmed non-empty values. */
function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Image-URL list cell → split on commas / whitespace / newlines. */
function parseUrlList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** "/cat/water-bottles/" or "water-bottles" → "water-bottles". */
export function normalizeCategorySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/?cat\//, '')
    .replace(/^\/+|\/+$/g, '');
}

function normalizeSwatch(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null;
}

// ── Row parsing ───────────────────────────────────────────────────────────────

interface RowReader {
  single: (key: SingleKey) => string;
  numbered: (group: NumberedRef['group'], n: number) => string;
  maxIndex: (group: NumberedRef['group']) => number;
}

function makeRowReader(headerRefs: ColumnRef[], cells: unknown[]): RowReader {
  const singleIdx = new Map<SingleKey, number>();
  const numberedIdx = new Map<string, number>();
  headerRefs.forEach((ref, i) => {
    if (ref.kind === 'single' && !singleIdx.has(ref.key)) singleIdx.set(ref.key, i);
    if (ref.kind === 'numbered') {
      const k = `${ref.ref.group}:${ref.ref.n}`;
      if (!numberedIdx.has(k)) numberedIdx.set(k, i);
    }
  });
  return {
    single: (key) => {
      const i = singleIdx.get(key);
      return i === undefined ? '' : cellString(cells[i]);
    },
    numbered: (group, n) => {
      const i = numberedIdx.get(`${group}:${n}`);
      return i === undefined ? '' : cellString(cells[i]);
    },
    maxIndex: (group) => {
      let max = 0;
      for (const key of numberedIdx.keys()) {
        const [g, n] = key.split(':');
        if (g === group) max = Math.max(max, Number(n));
      }
      return max;
    },
  };
}

function parseNumberField(
  r: RowReader,
  key: SingleKey,
  label: string,
  errors: string[],
  opts: { integer?: boolean; min?: number; max?: number } = {},
): number | undefined {
  const parsed = parseNumberCell(r.single(key));
  if (parsed === undefined) return undefined;
  if (parsed === null) {
    errors.push(`${label} is not a number ("${r.single(key)}").`);
    return undefined;
  }
  if (opts.integer && !Number.isInteger(parsed)) {
    errors.push(`${label} must be a whole number ("${r.single(key)}").`);
    return undefined;
  }
  if (opts.min !== undefined && parsed < opts.min) {
    errors.push(`${label} must be at least ${opts.min} ("${r.single(key)}").`);
    return undefined;
  }
  if (opts.max !== undefined && parsed > opts.max) {
    errors.push(`${label} must be at most ${opts.max} ("${r.single(key)}").`);
    return undefined;
  }
  return parsed;
}

function parseYesNoField(
  r: RowReader,
  key: SingleKey,
  label: string,
  warnings: string[],
): boolean | undefined {
  const parsed = parseYesNo(r.single(key));
  if (parsed === null) {
    warnings.push(`${label} should be "yes" or "no" ("${r.single(key)}") — left unset.`);
    return undefined;
  }
  return parsed;
}

function parseImageUrls(
  raw: string,
  label: string,
  warnings: string[],
  cap: number,
): string[] {
  const urls: string[] = [];
  for (const u of parseUrlList(raw)) {
    if (!isValidImageUrl(u)) {
      warnings.push(`${label}: "${u}" is not a valid http(s) image URL — skipped.`);
      continue;
    }
    if (urls.length >= cap) {
      warnings.push(`${label}: more than ${cap} images — extras skipped.`);
      break;
    }
    urls.push(u);
  }
  return urls;
}

function parseRow(headerRefs: ColumnRef[], cells: unknown[], rowNumber: number): ParsedRow {
  const r = makeRowReader(headerRefs, cells);
  const errors: string[] = [];
  const warnings: string[] = [];
  const fields: ParsedFields = {};

  // Title + slug (the upsert key)
  const title = r.single('title');
  if (!title) errors.push('Title is required.');

  let slug = '';
  const explicitSlug = r.single('slug');
  if (explicitSlug) {
    slug = slugify(explicitSlug);
    if (!slug) {
      errors.push(`Slug "${explicitSlug}" contains no usable characters.`);
    } else if (slug !== explicitSlug.trim()) {
      warnings.push(`Slug "${explicitSlug}" was cleaned up to "${slug}".`);
    }
  } else if (title) {
    slug = slugify(title);
    if (!slug) errors.push('Could not build a web address (slug) from the Title — add a Slug column.');
  }

  // Simple strings
  const brand = r.single('brand');
  if (brand) fields.brand = brand;
  const sku = r.single('item sku');
  if (sku) fields.sku = sku;
  const description = r.single('description');
  if (description) fields.descriptionText = description;
  const material = r.single('material');
  if (material) fields.material = material;
  const fobZip = r.single('fob zip');
  if (fobZip) fields.fobZip = fobZip;
  const fobCity = r.single('fob city');
  if (fobCity) fields.fobCity = fobCity;
  const fobState = r.single('fob state');
  if (fobState) fields.fobState = fobState;

  const leadRecipient = r.single('lead recipient');
  if (leadRecipient) {
    if (EMAIL_RE.test(leadRecipient)) fields.leadRecipient = leadRecipient;
    else warnings.push(`Lead Recipient "${leadRecipient}" is not a valid email — left unset.`);
  }

  const relatedCategory = r.single('related category');
  if (relatedCategory) fields.relatedCategorySlug = normalizeCategorySlug(relatedCategory);

  const addTo = parseList(r.single('add to categories')).map(normalizeCategorySlug).filter(Boolean);
  if (addTo.length) fields.addToCategories = [...new Set(addTo)];

  const keywords = parseList(r.single('related keywords'));
  if (keywords.length) fields.relatedKeywords = keywords;
  const features = parseList(r.single('features'));
  if (features.length) fields.features = features;
  const types = parseList(r.single('types'));
  if (types.length) fields.types = types;

  // Booleans
  const onSale = parseYesNoField(r, 'on sale', 'On Sale', warnings);
  if (onSale !== undefined) fields.onSale = onSale;
  const showInNew = parseYesNoField(r, 'show in new products', 'Show In New Products', warnings);
  if (showInNew !== undefined) fields.showInNewProducts = showInNew;
  const madeInUsa = parseYesNoField(r, 'made in usa', 'Made In USA', warnings);
  if (madeInUsa !== undefined) fields.madeInUsa = madeInUsa;
  const eco = parseYesNoField(r, 'eco friendly', 'Eco Friendly', warnings);
  if (eco !== undefined) fields.ecoFriendly = eco;
  const closeout = parseYesNoField(r, 'closeout', 'Closeout', warnings);
  if (closeout !== undefined) fields.closeout = closeout;

  // Numbers
  const minQty = parseNumberField(r, 'min qty', 'Min Qty', errors, { integer: true, min: 1 });
  if (minQty !== undefined) fields.minQty = minQty;
  const setupCharge = parseNumberField(r, 'setup charge', 'Setup Charge', errors, { min: 0 });
  if (setupCharge !== undefined) fields.setupCharge = setupCharge;
  const salePct = parseNumberField(r, 'sale percent off', 'Sale Percent Off', errors, { min: 1, max: 99 });
  if (salePct !== undefined) fields.salePercentOff = salePct;
  const prodTime = parseNumberField(r, 'production time', 'Production Time', errors, { min: 0 });
  if (prodTime !== undefined) fields.productionTime = prodTime;
  const unitsPerCarton = parseNumberField(r, 'units per carton', 'Units Per Carton', errors, { integer: true, min: 1 });
  if (unitsPerCarton !== undefined) fields.unitsPerCarton = unitsPerCarton;
  const cartonWeight = parseNumberField(r, 'carton weight', 'Carton Weight', errors, { min: 0 });
  if (cartonWeight !== undefined) fields.cartonWeight = cartonWeight;
  const cartonWidth = parseNumberField(r, 'carton width', 'Carton Width', errors, { min: 0 });
  if (cartonWidth !== undefined) fields.cartonWidth = cartonWidth;
  const cartonHeight = parseNumberField(r, 'carton height', 'Carton Height', errors, { min: 0 });
  if (cartonHeight !== undefined) fields.cartonHeight = cartonHeight;
  const cartonDepth = parseNumberField(r, 'carton depth', 'Carton Depth', errors, { min: 0 });
  if (cartonDepth !== undefined) fields.cartonDepth = cartonDepth;

  // Sizes
  const sizes: string[] = [];
  for (let n = 1; n <= r.maxIndex('size'); n += 1) {
    const v = r.numbered('size', n);
    if (!v) continue;
    if (sizes.length >= MAX_SIZES) {
      warnings.push(`More than ${MAX_SIZES} sizes — extras skipped.`);
      break;
    }
    sizes.push(v);
  }
  if (sizes.length) fields.sizes = sizes;

  // Pricing tiers (a tier needs BOTH cells)
  const tiers: ParsedTier[] = [];
  const tierMax = Math.max(r.maxIndex('tierQty'), r.maxIndex('tierPrice'));
  for (let n = 1; n <= tierMax; n += 1) {
    const qtyRaw = r.numbered('tierQty', n);
    const priceRaw = r.numbered('tierPrice', n);
    if (!qtyRaw && !priceRaw) continue;
    if (!qtyRaw || !priceRaw) {
      warnings.push(`Tier ${n} needs both a Qty and a Price — skipped.`);
      continue;
    }
    const qty = parseNumberCell(qtyRaw);
    const price = parseNumberCell(priceRaw);
    if (qty === null || qty === undefined || !Number.isInteger(qty) || qty < 1) {
      warnings.push(`Tier ${n} Qty "${qtyRaw}" must be a whole number of 1 or more — tier skipped.`);
      continue;
    }
    if (price === null || price === undefined || price <= 0) {
      warnings.push(`Tier ${n} Price "${priceRaw}" must be a price above 0 — tier skipped.`);
      continue;
    }
    if (tiers.length >= MAX_TIERS) {
      warnings.push(`More than ${MAX_TIERS} pricing tiers — extras skipped (the page shows up to ${MAX_TIERS}).`);
      break;
    }
    tiers.push({ minQty: qty, price });
  }
  if (tiers.length) fields.pricingTiers = tiers.sort((a, b) => a.minQty - b.minQty);

  // Decorations
  const decorations: ParsedDecoration[] = [];
  const decMax = Math.max(r.maxIndex('decoration'), r.maxIndex('decorationUpcharge'));
  for (let n = 1; n <= decMax; n += 1) {
    const method = r.numbered('decoration', n);
    const upRaw = r.numbered('decorationUpcharge', n);
    if (!method) {
      if (upRaw) warnings.push(`Decoration ${n} Upcharge has no Decoration ${n} name — skipped.`);
      continue;
    }
    if (decorations.length >= MAX_DECORATIONS) {
      warnings.push(`More than ${MAX_DECORATIONS} decorations — extras skipped.`);
      break;
    }
    const dec: ParsedDecoration = { method };
    if (upRaw) {
      const up = parseNumberCell(upRaw);
      if (up === null || up === undefined || up < 0) {
        warnings.push(`Decoration ${n} Upcharge "${upRaw}" is not a valid amount — imported with no upcharge.`);
      } else {
        dec.upcharge = up;
      }
    }
    decorations.push(dec);
  }
  if (decorations.length) fields.decorationMethods = decorations;

  // Default images
  const defaultImages: string[] = [];
  for (let n = 1; n <= r.maxIndex('image'); n += 1) {
    const v = r.numbered('image', n);
    if (!v) continue;
    if (!isValidImageUrl(v)) {
      warnings.push(`Image ${n}: "${v}" is not a valid http(s) image URL — skipped.`);
      continue;
    }
    if (defaultImages.length >= MAX_IMAGES) {
      warnings.push(`More than ${MAX_IMAGES} images — extras skipped.`);
      break;
    }
    defaultImages.push(v);
  }
  if (defaultImages.length) fields.defaultImageUrls = defaultImages;

  // Color variants
  const colors: ParsedColorVariant[] = [];
  const colorMax = Math.max(r.maxIndex('colorName'), r.maxIndex('colorImages'), r.maxIndex('colorSwatch'));
  for (let n = 1; n <= colorMax; n += 1) {
    const name = r.numbered('colorName', n);
    const imagesRaw = r.numbered('colorImages', n);
    const swatchRaw = r.numbered('colorSwatch', n);
    if (!name) {
      if (imagesRaw || swatchRaw) {
        warnings.push(`Color ${n} has images/swatch but no Color ${n} Name — skipped.`);
      }
      continue;
    }
    if (colors.length >= MAX_COLORS) {
      warnings.push(`More than ${MAX_COLORS} colors — extras skipped.`);
      break;
    }
    const variant: ParsedColorVariant = {
      colorName: name,
      imageUrls: parseImageUrls(imagesRaw, `Color ${n} Images`, warnings, MAX_IMAGES),
    };
    if (swatchRaw) {
      const swatch = normalizeSwatch(swatchRaw);
      if (swatch) variant.swatchHex = swatch;
      else warnings.push(`Color ${n} Swatch "${swatchRaw}" is not a hex color like #1E3A8A — left unset.`);
    }
    if (variant.imageUrls.length === 0) {
      warnings.push(`Color ${n} ("${name}") has no usable images — the color will show with no photos.`);
    }
    colors.push(variant);
  }
  if (colors.length) fields.colorVariants = colors;

  return { rowNumber, title, slug, fields, errors, warnings };
}

// ── File parsing ──────────────────────────────────────────────────────────────

function isBlankRow(cells: unknown[]): boolean {
  return cells.every((c) => cellString(c) === '');
}

export function parseProductSheet(data: Uint8Array): BulkParseResult {
  const fileErrors: string[] = [];
  const unknownColumns: string[] = [];

  let grid: unknown[][];
  try {
    const wb = XLSX.read(data, { type: 'buffer', raw: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return { ok: false, fileErrors: ['The file has no sheets.'], unknownColumns, rows: [] };
    }
    const ws = wb.Sheets[sheetName];
    grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, raw: false });
  } catch {
    return {
      ok: false,
      fileErrors: ['Could not read the file. Save it as .csv or .xlsx and try again.'],
      unknownColumns,
      rows: [],
    };
  }

  if (grid.length === 0 || isBlankRow(grid[0] ?? [])) {
    return {
      ok: false,
      fileErrors: ['The first row must be the column headings (start from the sample template).'],
      unknownColumns,
      rows: [],
    };
  }

  const headerCells = (grid[0] ?? []).map((c) => cellString(c));
  const headerRefs = headerCells.map(classifyHeader);

  headerRefs.forEach((ref, i) => {
    if (ref.kind === 'unknown' && headerCells[i]) unknownColumns.push(headerCells[i]);
  });

  if (!headerRefs.some((ref) => ref.kind === 'single' && ref.key === 'title')) {
    return {
      ok: false,
      fileErrors: ['No "Title" column found — the headings must match the sample template.'],
      unknownColumns,
      rows: [],
    };
  }

  // Data rows (skip fully blank rows but keep real spreadsheet row numbers).
  const dataRows: Array<{ cells: unknown[]; rowNumber: number }> = [];
  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i] ?? [];
    if (isBlankRow(cells)) continue;
    dataRows.push({ cells, rowNumber: i + 1 });
  }

  if (dataRows.length === 0) {
    return { ok: false, fileErrors: ['The file has no product rows below the headings.'], unknownColumns, rows: [] };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      fileErrors: [
        `The file has ${dataRows.length} product rows — the limit is ${MAX_IMPORT_ROWS} per upload. Split it into smaller files.`,
      ],
      unknownColumns,
      rows: [],
    };
  }

  const rows = dataRows.map(({ cells, rowNumber }) => parseRow(headerRefs, cells, rowNumber));

  // Duplicate slugs within the same file: the first row wins, later ones error.
  const seenSlugs = new Map<string, number>();
  for (const row of rows) {
    if (!row.slug || row.errors.length > 0) continue;
    const firstRow = seenSlugs.get(row.slug);
    if (firstRow !== undefined) {
      row.errors.push(`Same web address (slug "${row.slug}") as row ${firstRow} — remove one of the two rows.`);
    } else {
      seenSlugs.set(row.slug, row.rowNumber);
    }
  }

  return { ok: true, fileErrors, unknownColumns, rows };
}

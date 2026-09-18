/**
 * FIX-881: the catalog key vocabulary and its Studio warning.
 *
 * Three things are pinned here. (1) The behaviour of the warning: a known key
 * is silent, `holidayguide` names `holiday-guide`, an unknown key with no near
 * match still says the three things FIX-880 found missing. (2) The list cannot
 * drift: it is re-derived from data/geiger/catalogs.json AND from the scraper's
 * own CATALOGS list on every run (the lib/portfolio/colors.test.ts precedent).
 * (3) The list is spelled in exactly one TypeScript file, and the schema uses
 * it through an import and a `.warning()` rule, never an error.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CURRENT_CATALOG_KEYS,
  catalogKeyWarning,
  looseCatalogKey,
  nearestCatalogKey,
} from './catalog-key';

const root = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

const MODULE = 'sanity/schemas/documents/catalog-key.ts';
const TEST = 'sanity/schemas/documents/catalog-key.test.ts';
const SCHEMA = 'sanity/schemas/documents/catalog-page.ts';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('CURRENT_CATALOG_KEYS is the one list, and it matches the data (FIX-881)', () => {
  it('equals the catalog slugs in data/geiger/catalogs.json, in file order', () => {
    const file = JSON.parse(read('data/geiger/catalogs.json')) as { catalogs: { slug: string }[] };
    expect(file.catalogs.map((c) => c.slug)).toEqual([...CURRENT_CATALOG_KEYS]);
  });

  it("equals the scraper's CATALOGS slugs, in order", () => {
    const py = read('scripts/scrapers/geiger/scrape_catalogs.py');
    const slugs = [...py.matchAll(/"slug":\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(slugs).toEqual([...CURRENT_CATALOG_KEYS]);
  });

  it('is spelled in no other TypeScript file under app/, components/, lib/, sanity/ or scripts/', () => {
    const offenders: string[] = [];
    // A LIST is two or more distinct keys quoted in one file, or an assignment
    // to CURRENT_CATALOG_KEYS. One quoted key is an example in prose (the Slug
    // field's help text says `"usa-made"` becomes /shop-by-theme/usa-made) and
    // is allowed. `ideas` is deliberately not in the pattern: it is an ordinary
    // English word that two stop-word lists legitimately contain.
    const keyLiteral =
      /['"](green-guide|womens-collection|holiday-guide|usa-made|retail-collective|trend-talk)['"]/g;
    for (const dir of ['app', 'components', 'lib', 'sanity', 'scripts']) {
      for (const file of listSourceFiles(resolve(root, dir))) {
        const rel = file.slice(root.length + 1).replace(/\\/g, '/');
        if (rel === MODULE || rel === TEST) continue;
        const src = readFileSync(file, 'utf8');
        const distinct = new Set([...src.matchAll(keyLiteral)].map((m) => m[1]));
        if (/CURRENT_CATALOG_KEYS\s*=/.test(src) || distinct.size >= 2) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has seven keys, all lowercase letters, digits and dashes, each once', () => {
    expect(CURRENT_CATALOG_KEYS).toHaveLength(7);
    for (const key of CURRENT_CATALOG_KEYS) expect(key).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(CURRENT_CATALOG_KEYS).size).toBe(CURRENT_CATALOG_KEYS.length);
  });
});

describe('the schema uses the module, as a warning, never an error (FIX-881)', () => {
  const schema = read(SCHEMA);

  it('imports the list and the rule from ./catalog-key and defines no list of its own', () => {
    expect(schema).toMatch(/import \{ CURRENT_CATALOG_KEYS, catalogKeyWarning \} from '\.\/catalog-key';/);
    expect(schema).not.toMatch(/CURRENT_CATALOG_KEYS\s*=/);
  });

  it('quotes the list in the help text and applies the rule with .warning()', () => {
    expect(schema).toContain('CURRENT_CATALOG_KEYS.join(');
    expect(schema).toContain('Rule.custom((value?: string) => catalogKeyWarning(value) ?? true).warning()');
    // The shape rule is untouched and still the only error on the field.
    expect(schema).toContain("if (!/^[a-z0-9-]+$/.test(v)) return 'Lowercase letters, numbers, and dashes only.';");
  });

  it('carries no em dash in the module or the schema additions', () => {
    // Written as the escape so this file is itself free of the character.
    expect(read(MODULE)).not.toContain('\u2014');
    expect(read(TEST)).not.toContain('\u2014');
  });
});

describe('looseCatalogKey', () => {
  it('drops dashes, underscores, spaces and case', () => {
    expect(looseCatalogKey('holiday-guide')).toBe('holidayguide');
    expect(looseCatalogKey('Holiday-Guide')).toBe('holidayguide');
    expect(looseCatalogKey('holiday_guide')).toBe('holidayguide');
    expect(looseCatalogKey('holiday guide')).toBe('holidayguide');
    expect(looseCatalogKey('HOLIDAYGUIDE')).toBe('holidayguide');
  });
  it('leaves letters and digits alone', () => {
    expect(looseCatalogKey('trend-talk-2026')).toBe('trendtalk2026');
  });
});

describe('nearestCatalogKey', () => {
  it("names the key Patrick's typo was one dash away from", () => {
    expect(nearestCatalogKey('holidayguide')).toBe('holiday-guide');
  });
  it('matches on dashes, underscores, spaces and case', () => {
    expect(nearestCatalogKey('Holiday-Guide')).toBe('holiday-guide');
    expect(nearestCatalogKey('holiday_guide')).toBe('holiday-guide');
    expect(nearestCatalogKey('holiday guide')).toBe('holiday-guide');
    expect(nearestCatalogKey('HOLIDAYGUIDE')).toBe('holiday-guide');
    expect(nearestCatalogKey('usamade')).toBe('usa-made');
    expect(nearestCatalogKey('greenguide')).toBe('green-guide');
    expect(nearestCatalogKey('womenscollection')).toBe('womens-collection');
    expect(nearestCatalogKey('retailcollective')).toBe('retail-collective');
    expect(nearestCatalogKey('trendtalk')).toBe('trend-talk');
  });
  it('returns null for a known key, a blank, and a value with no near match', () => {
    for (const key of CURRENT_CATALOG_KEYS) expect(nearestCatalogKey(key)).toBeNull();
    expect(nearestCatalogKey('')).toBeNull();
    expect(nearestCatalogKey('   ')).toBeNull();
    expect(nearestCatalogKey('---')).toBeNull();
    expect(nearestCatalogKey('xyz')).toBeNull();
    // A plural or a suffix is a different word, not a separator slip.
    expect(nearestCatalogKey('holiday-guides')).toBeNull();
    expect(nearestCatalogKey('holiday-guide-2026')).toBeNull();
  });
  it('takes the key list as a parameter', () => {
    expect(nearestCatalogKey('newcatalog', ['new-catalog'])).toBe('new-catalog');
    expect(nearestCatalogKey('holidayguide', ['new-catalog'])).toBeNull();
  });
});

describe('catalogKeyWarning', () => {
  const LIST = CURRENT_CATALOG_KEYS.join(', ');

  it('is silent for every current key', () => {
    for (const key of CURRENT_CATALOG_KEYS) expect(catalogKeyWarning(key)).toBeNull();
  });

  it('is silent for blank and non-string values (the required rule reports those)', () => {
    expect(catalogKeyWarning(undefined)).toBeNull();
    expect(catalogKeyWarning(null)).toBeNull();
    expect(catalogKeyWarning('')).toBeNull();
    expect(catalogKeyWarning('   ')).toBeNull();
    expect(catalogKeyWarning(42)).toBeNull();
  });

  it('for "holidayguide" says exact match, not the Geiger address, the list, and names holiday-guide', () => {
    const msg = catalogKeyWarning('holidayguide');
    expect(msg).toBe(
      `"holidayguide" is not one of the catalog keys, so no Geiger products would load on this catalog's pages. Did you mean "holiday-guide"? The key is not the Geiger web address: type it exactly as listed, dash included. Current keys: ${LIST}.`,
    );
  });

  it('names the near match for a case or underscore slip too', () => {
    expect(catalogKeyWarning('Holiday-Guide')).toContain('Did you mean "holiday-guide"?');
    expect(catalogKeyWarning('usa_made')).toContain('Did you mean "usa-made"?');
  });

  it('for a value with no near match still says the three things, and that publishing is allowed', () => {
    const msg = catalogKeyWarning('xyz');
    expect(msg).toBe(
      `"xyz" is not one of the catalog keys, so no Geiger products would load on this catalog's pages. The key is not the Geiger web address: type it exactly as listed, dash included. Current keys: ${LIST}. If this is a brand-new catalog we have only just added to the scraper, you can publish anyway.`,
    );
    expect(msg).not.toContain('Did you mean');
  });

  it('catches a known key wrapped in whitespace, which the shape rule trims but the render path does not', () => {
    const msg = catalogKeyWarning('holiday-guide ');
    expect(msg).toContain('"holiday-guide" has a space before or after it');
    expect(msg).toContain('Remove the space.');
    expect(msg).toContain(`Current keys: ${LIST}.`);
    expect(catalogKeyWarning(' ideas')).toContain('has a space before or after it');
  });

  it('repeats back at most 40 characters of a long stray value', () => {
    const long = 'a'.repeat(80);
    const msg = catalogKeyWarning(long) ?? '';
    expect(msg.startsWith(`"${'a'.repeat(40)}..." is not one of the catalog keys`)).toBe(true);
    expect(msg).not.toContain('a'.repeat(41));
  });

  it('never rewrites the value: the message quotes it, the rule returns only text', () => {
    const msg = catalogKeyWarning('holidayguide') ?? '';
    expect(typeof msg).toBe('string');
    expect(msg).toContain('"holidayguide"');
  });

  it('takes the key list as a parameter, so a new key needs no code change here to be tested', () => {
    expect(catalogKeyWarning('new-catalog', ['new-catalog'])).toBeNull();
    expect(catalogKeyWarning('newcatalog', ['new-catalog'])).toContain('Did you mean "new-catalog"?');
  });
});

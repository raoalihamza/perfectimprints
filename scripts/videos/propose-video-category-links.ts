/**
 * VID-100 Part 3: propose a root category page for each published video, with
 * the evidence, for Ali to approve BEFORE anything is written to Sanity.
 *
 *   pnpm videos:propose-links             writes docs/videos/VID-100-proposed-video-category-links.{md,json}
 *   pnpm videos:propose-links -- --force  overwrites a JSON that Ali has already marked approved
 *
 * Read only: an anonymous read of the published dataset (no token), the
 * category data on disk, and FIX-911's category resolver. Calls no AI model.
 * Writes nothing to Sanity; the writer is scripts/videos/apply-video-category-links.ts,
 * which refuses to run until the JSON's "approved" is true.
 *
 * How a root is chosen (the markdown repeats this for Ali). The resolver
 * (lib/ai/category-resolver.ts: root slugs plus the product names each root
 * actually shows, Patrick's curation included) is given the video's title,
 * each colon or dash segment of the title, and each AI topic keyword. The
 * DESCRIPTION is deliberately not fed to it: the resolver takes a product
 * phrase, not prose. The second signal is the video's own product strip: each
 * Geiger SKU is looked up in every root's effective product set, and each of
 * Patrick's own product pages in the strip is read for its category links.
 * A root is PROPOSED when the title names it and the strip's products sit in
 * it (or the strip gives no evidence and the title rule is a strong one);
 * POSSIBLE when one signal stands alone or the two disagree; NONE otherwise.
 * A video with no row is better than a video on the wrong page (FIX-910/911).
 *
 * Run from the repo root; data/categories is read from the current directory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAllGeneratedRootSlugs,
  getCategoryContent,
  getProductsForCategorySlug,
  resolveProductsBySku,
  shouldShowEmptyStateCTA,
} from '../../lib/categories';
import { assembleCategoryEvidence } from '../../lib/ai/category-evidence';
import {
  buildCategoryIndex,
  categoryCandidates,
  type CategoryCandidate,
} from '../../lib/ai/category-resolver';
import { productPhraseTokens } from '../../lib/ai/match-tokens';
import { NEAR_GENERIC_WORDS } from '../../lib/ai/brand-voice';
import type { CategoryCuration } from '../../lib/sanity/queries/category-evidence';

const PROJECT = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'ii96lcy9';
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
const FORCE = process.argv.includes('--force');

async function groq<T>(query: string): Promise<T> {
  const url = `https://${PROJECT}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).result as T;
}

// The resolver's curation read, verbatim from lib/sanity/queries/category-evidence.ts
// (that module is `server-only`, so the query is repeated here for an anonymous read).
const CURATION_QUERY = `{
  "overrides": *[_type == "categoryOverride" && defined(categorySlug)] | order(_updatedAt desc) {
    categorySlug, forceCTA, forceProducts, replaceProducts, hiddenSkus, addedSkus,
    "added": addedProducts[]->{ _id, _type, title, brand, "slug": slug.current }
  },
  "placements": *[_type == "productPlacement" && defined(sku)]{ sku, addToCategories, removeFromCategories },
  "pages": *[_type == "productPage" && defined(slug.current) && count(addToCategories) > 0]{ _id, title, brand, addToCategories },
  "owned": *[_type == "customCategory" && defined(slug.current)]{
    "slug": slug.current, productSkus,
    "custom": *[_type == "customProduct" && references(^._id)]{ _id, title, brand }
  }
}`;

interface VideoRow {
  _id: string;
  title: string;
  slug: string;
  publishDate?: string;
  categories: (string | null)[];
  skus: string[] | null;
  refs: { _type: string; title: string; slug?: string; addToCategories?: string[]; relatedCategorySlug?: string }[] | null;
  aiTopicKeywords: string[] | null;
  relatedCategorySlugs?: string[] | null;
}

const VIDEOS_QUERY = `*[_type == "video" && !(_id in path("drafts.**")) && defined(embedUrl)] | order(publishDate desc) {
  _id, title, "slug": slug.current, publishDate,
  "categories": coalesce(categories[]->title, [category->title]),
  "skus": relatedProducts[defined(sku)].sku,
  "refs": relatedProducts[_type == "relatedProductRef"]->{ _type, title, "slug": slug.current, addToCategories, relatedCategorySlug },
  aiTopicKeywords, relatedCategorySlugs
}`;

const label = (p: { name?: string; title?: string; brand?: string | null }) => `${p.name ?? p.title ?? ''} ${p.brand ?? ''}`.trim();
const trimmed = (l: readonly (string | null | undefined)[] | null | undefined) => (l ?? []).map((s) => `${s ?? ''}`.trim()).filter(Boolean);

/** SKU membership per root, mirroring assembleCategoryEvidence's membership half (skus instead of names). */
function skuMembership(roots: string[], curation: CategoryCuration): Map<string, Set<string>> {
  const overrideBySlug = new Map<string, CategoryCuration['overrides'][number]>();
  for (const o of curation.overrides) {
    const s = (o.categorySlug ?? '').trim();
    if (s && !overrideBySlug.has(s)) overrideBySlug.set(s, o);
  }
  const ownedBySlug = new Map(curation.owned.filter((o) => o.slug).map((o) => [o.slug as string, o]));
  const adds = new Map<string, string[]>();
  const removes = new Map<string, string[]>();
  for (const p of curation.placements) {
    const sku = `${p.sku ?? ''}`.trim();
    if (!sku) continue;
    for (const s of trimmed(p.addToCategories)) adds.set(s, [...(adds.get(s) ?? []), sku]);
    for (const s of trimmed(p.removeFromCategories)) removes.set(s, [...(removes.get(s) ?? []), sku]);
  }
  const pagesBySlug = new Map<string, string[]>();
  for (const page of curation.pages) for (const s of trimmed(page.addToCategories)) pagesBySlug.set(s, [...(pagesBySlug.get(s) ?? []), `custom-${page._id}`]);

  const out = new Map<string, Set<string>>();
  for (const slug of roots) {
    const override = overrideBySlug.get(slug);
    const owned = ownedBySlug.get(slug);
    const removed = new Set([...trimmed(override?.hiddenSkus), ...(removes.get(slug) ?? [])]);
    const base = override?.replaceProducts ? [] : owned ? trimmed(owned.productSkus) : getProductsForCategorySlug(slug).map((p) => p.sku);
    const set = new Set<string>();
    for (const sku of [...trimmed(override?.addedSkus), ...(adds.get(slug) ?? []), ...base, ...(pagesBySlug.get(slug) ?? [])]) {
      if (!removed.has(sku)) set.add(sku);
    }
    for (const d of override?.added ?? []) if (d?._id) set.add(`custom-${d._id}`);
    for (const d of owned?.custom ?? []) if (d?._id) set.add(`custom-${d._id}`);
    out.set(slug, set);
  }
  return out;
}

const fmtCand = (c: CategoryCandidate) =>
  `${c.slug} (${c.rule}: ${c.words.join(' ')}${c.products != null ? `, ${c.products} products${c.share != null ? ` = ${Math.round(c.share * 100)}%` : ''}` : ''})`;

async function main() {
  const [videos, curation, blogRoots] = await Promise.all([
    groq<VideoRow[]>(VIDEOS_QUERY),
    groq<CategoryCuration>(CURATION_QUERY),
    groq<string[]>(`array::unique(*[_type == "blogPost" && !(_id in path("drafts.**"))].relatedCategorySlugs[])`),
  ]);
  const roots = getAllGeneratedRootSlugs();
  // /cat/products is the catch-all department (CTA page, full-capped-60 with 0 products): the
  // bare word 'products' survives the generic-word strip and would match it 'exact' on every
  // strategy title. Never a target.
  const EXCLUDED_TARGETS = new Set(['products']);
  // The department-level roots (the mega menu's column heads). A proposal that lands on one is
  // still a real page, but a narrower root may fit better, so the Why column says so.
  const DEPARTMENT_ROOTS = new Set(['apparel', 'bags', 'drinkware', 'health', 'household', 'office', 'outdoor', 'writing']);
  const rootSet = new Set(roots.filter((r) => !EXCLUDED_TARGETS.has(r)));
  const owned = new Set(curation.owned.map((o) => o.slug).filter(Boolean) as string[]);
  const evidence = assembleCategoryEvidence({
    roots,
    baked: (slug) => getProductsForCategorySlug(slug),
    bakedShowsCta: (slug) => {
      const c = getCategoryContent(slug);
      return !c || shouldShowEmptyStateCTA(c);
    },
    bySku: (skus) => resolveProductsBySku([...skus]),
    curation,
  });
  const index = buildCategoryIndex(evidence);
  const membership = skuMembership(roots, curation);
  // A candidate matched ONLY on near-generic words (products, items, gifts, business, company) is
  // no evidence: 'Best Promotional Products for Women' matched excluded-products 'exact' on the
  // bare word products.
  const nearGeneric = new Set<string>(NEAR_GENERIC_WORDS as Iterable<string>);
  const usable = (c: CategoryCandidate) => rootSet.has(c.slug) && !c.words.every((w) => nearGeneric.has(w));
  const h1 = (slug: string) => getCategoryContent(slug)?.h1 ?? slug;

  interface Proposal {
    slug: string;
    title: string;
    _id: string;
    publishDate?: string;
    decision: 'propose' | 'possible' | 'none';
    root: string | null;
    rootH1: string | null;
    confidence: string;
    evidence: string[];
    stripSize: number;
    ownedRoot?: boolean;
  }
  const rows: Proposal[] = [];

  for (const v of videos) {
    const ev: string[] = [];
    // Signal A: the title, whole and by colon / dash segment.
    const phrases = [v.title, ...v.title.split(/[:|]|\s[-–]\s/).map((s) => s.trim()).filter((s) => s && s !== v.title)];
    const titleCands = new Map<string, CategoryCandidate>();
    for (const phrase of phrases) {
      const cands = categoryCandidates(phrase, index).filter(usable);
      if (cands.length > 0) {
        ev.push(`title "${phrase}" -> ${cands.slice(0, 2).map(fmtCand).join(' | ')}`);
        if (!titleCands.has(cands[0].slug)) titleCands.set(cands[0].slug, cands[0]);
      } else if (productPhraseTokens(phrase).length > 0) {
        ev.push(`title "${phrase}" -> no root (${productPhraseTokens(phrase).join(' ')})`);
      }
    }
    // Signal B: topic keywords.
    const kwRoots = new Map<string, CategoryCandidate>();
    for (const kw of v.aiTopicKeywords ?? []) {
      const cands = categoryCandidates(kw, index).filter(usable);
      if (cands.length > 0) {
        ev.push(`keyword "${kw}" -> ${fmtCand(cands[0])}`);
        if (!kwRoots.has(cands[0].slug)) kwRoots.set(cands[0].slug, cands[0]);
      }
    }
    // Signal C: the strip's Geiger SKUs, by root membership; Patrick's pages by their own links.
    const skus = (v.skus ?? []).map((s) => s.trim()).filter(Boolean);
    const refs = v.refs ?? [];
    const stripSize = skus.length + refs.length;
    const byRoot = new Map<string, number>();
    for (const sku of skus) for (const [root, set] of membership) if (set.has(sku)) byRoot.set(root, (byRoot.get(root) ?? 0) + 1);
    const pageRoots = new Map<string, number>();
    for (const r of refs) {
      for (const s of [...(r.addToCategories ?? []), r.relatedCategorySlug].filter(Boolean) as string[]) {
        const root = s.split('/')[0];
        if (rootSet.has(root)) pageRoots.set(root, (pageRoots.get(root) ?? 0) + 1);
      }
    }
    const stripRanked = [...byRoot.entries()].sort((a, b) => b[1] - a[1]);
    if (skus.length > 0) {
      const resolved = resolveProductsBySku(skus).length;
      ev.push(
        `strip: ${skus.length} Geiger SKUs (${resolved} in the catalogue)${stripRanked.length ? `, most in ${stripRanked.slice(0, 3).map(([r, n]) => `${r} ${n}/${skus.length}`).join(', ')}` : ', in no root'}`,
      );
    }
    if (refs.length > 0) {
      ev.push(
        `strip: ${refs.length} of Patrick's own product pages${pageRoots.size ? `, linked to ${[...pageRoots.entries()].map(([r, n]) => `${r} (${n})`).join(', ')}` : ', none linked to a category'}`,
      );
    }
    if (v.categories.filter(Boolean).length) ev.push(`blog categories: ${v.categories.filter(Boolean).join(', ')}`);

    // Decision.
    // The strip gives EVIDENCE only when at least one of its Geiger SKUs sits
    // in some root or one of Patrick's pages is linked to a root; a strip of
    // unlinked product pages is no evidence either way (not a disagreement).
    const stripEvidence = byRoot.size > 0 || pageRoots.size > 0;
    const stripTop = stripRanked[0];
    const stripShare = stripTop ? stripTop[1] / Math.max(1, skus.length) : 0;
    // Agreement: at least half the Geiger SKUs sit in the root (a tote SKU is in
    // both `bags` and `tote-bags`, so "the top root" is the wrong test), or one
    // of Patrick's own pages in the strip is linked to the root.
    const agrees = (root: string) =>
      (skus.length > 0 && (byRoot.get(root) ?? 0) / skus.length >= 0.5) || (pageRoots.get(root) ?? 0) > 0;
    // A rule strong enough to stand WITHOUT a strip: the slug carries every word
    // of the phrase, or names its two-word tail, or is a multi-word slug named
    // outright. A ONE-word slug named somewhere in a sentence is not ("Fans
    // Love" named `fans`; "Can coolers" named `coolers` ahead of koozies).
    const slugWords = (slug: string) => slug.split('-').filter((w) => w.length >= 3).length;
    const strong = (c: CategoryCandidate) =>
      c.rule === 'exact' || c.rule === 'tail-slug' || (c.rule === 'named' && slugWords(c.slug) >= 2);

    let decision: Proposal['decision'] = 'none';
    let root: string | null = null;
    let confidence = '';
    const titleList = [...titleCands.values()];
    const titleAgreeing = titleList.find((c) => agrees(c.slug));
    const kwAgreeing = [...kwRoots.values()].find((c) => agrees(c.slug));
    const titleAndKw = titleList.find((x) => kwRoots.has(x.slug));
    const kwShare = kwAgreeing ? (byRoot.get(kwAgreeing.slug) ?? 0) / Math.max(1, skus.length) : 0;
    if (titleAgreeing) {
      decision = 'propose';
      root = titleAgreeing.slug;
      confidence = `title names the root (${titleAgreeing.rule}) and the strip's products sit in it`;
    } else if (kwAgreeing && titleList.length === 0 && (kwShare >= 0.75 || (pageRoots.get(kwAgreeing.slug) ?? 0) > 0)) {
      // The the title resolved to no root; Patrick's topic keyword does, and three
      // quarters of the strip (or one of his own linked pages) sits there.
      decision = 'propose';
      root = kwAgreeing.slug;
      confidence = `the title resolved to no root; the topic keyword names the root (${kwAgreeing.rule}) and ${pageRoots.get(kwAgreeing.slug) ? "Patrick's own page in the strip is linked to it" : `${Math.round(kwShare * 100)}% of the strip's products sit in it`}`;
    } else if (kwAgreeing) {
      decision = 'possible';
      root = kwAgreeing.slug;
      confidence =
        titleList.length > 0
          ? `the title resolves to ${titleList[0].slug} (${titleList[0].rule}) but the topic keyword and the strip point at ${kwAgreeing.slug}`
          : `the title resolved to no root; the topic keyword names the root and ${Math.round(kwShare * 100)}% of the strip sits in it`;
    } else if (titleAndKw && !stripEvidence) {
      decision = 'propose';
      root = titleAndKw.slug;
      confidence = `title and topic keyword both name the root (${titleAndKw.rule}); the strip gives no evidence either way`;
    } else if (titleList.length > 0 && !stripEvidence && strong(titleList[0])) {
      decision = 'propose';
      root = titleList[0].slug;
      confidence = `title names the root (${titleList[0].rule}); ${stripSize === 0 ? 'the video has no product strip to cross-check' : 'the strip gives no evidence either way'}`;
    } else if (titleAndKw) {
      decision = 'possible';
      root = titleAndKw.slug;
      confidence = `title and topic keyword name the root (${titleAndKw.rule}) but the strip's products sit elsewhere`;
    } else if (titleList.length > 0) {
      decision = 'possible';
      root = titleList[0].slug;
      confidence = stripEvidence
        ? `title alone (${titleList[0].rule}); the strip's products sit elsewhere`
        : `title alone, a weak rule (${titleList[0].rule}), nothing to cross-check`;
    } else if (stripTop && skus.length >= 3 && stripShare >= 0.6 && stripRanked.length > 0) {
      decision = 'possible';
      root = stripTop[0];
      confidence = `strip only: ${stripTop[1]} of ${skus.length} products sit in ${stripTop[0]}; the the title resolved to no root`;
    } else if (pageRoots.size === 1 && titleList.length === 0 && skus.length === 0) {
      decision = 'possible';
      root = [...pageRoots.keys()][0];
      confidence = `only Patrick's product page links name a root; the the title resolved to no root`;
    }
    if (root && DEPARTMENT_ROOTS.has(root)) confidence += '; DEPARTMENT-LEVEL root, check whether a narrower page fits';
    const ownedRoot = root ? owned.has(root) : false;
    rows.push({ slug: v.slug, title: v.title, _id: v._id, publishDate: v.publishDate, decision, root, rootH1: root ? h1(root) : null, confidence, evidence: ev, stripSize, ownedRoot });
  }

  // Cadence of video publishes, for the cache question.
  const byMonth = new Map<string, number>();
  for (const v of videos) {
    const m = (v.publishDate ?? '').slice(0, 7) || 'none';
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }

  const proposed = rows.filter((r) => r.decision === 'propose' && !r.ownedRoot);
  const proposedOwned = rows.filter((r) => r.decision === 'propose' && r.ownedRoot);
  const possible = rows.filter((r) => r.decision === 'possible');
  const none = rows.filter((r) => r.decision === 'none');
  const rootsCovered = new Set(proposed.map((r) => r.root));
  const blogRootSet = new Set(blogRoots);

  const outDir = join(process.cwd(), 'docs', 'videos');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'VID-100-proposed-video-category-links.json');
  if (existsSync(jsonPath) && !FORCE) {
    try {
      if (JSON.parse(readFileSync(jsonPath, 'utf8')).approved === true) {
        console.error(`${jsonPath} is marked approved; refusing to overwrite the reviewed list. Pass --force to regenerate it.`);
        process.exit(1);
      }
    } catch {
      /* unreadable: overwrite */
    }
  }
  const md: string[] = [];
  md.push('# VID-100: proposed category links for the 130 published videos');
  md.push('');
  md.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`pnpm videos:propose-links\` (read only, no AI call, zero spend) from the production dataset and the production repo's category data. Nothing has been written to Sanity. Ali approves this list; \`pnpm videos:apply-links\` writes only the approved rows: set \`"approved": true\` in the JSON beside this file; a row under Proposed with \`"skip": true\` is left out, a row under Possible with \`"approve": true\` is written, and a row's root can be corrected by hand before writing.`);
  md.push('');
  md.push('## How a root was chosen');
  md.push('');
  md.push('Each video was given to FIX-911\'s category resolver (`lib/ai/category-resolver.ts`, slugs and the product names each root actually shows, Patrick\'s curation included) three ways: the whole title, each colon or dash segment of the title, and each AI topic keyword. The description was NOT fed to it: the resolver takes a product phrase, not prose, and a 500-word description has no single tail to resolve. The second signal is the video\'s own product strip: each Geiger SKU was looked up in every root\'s effective product set (baked list, overrides, placements, hides), and each of Patrick\'s own product pages in the strip was read for its "Add to categories" and "Related category" links.');
  md.push('');
  md.push('- **Proposed**: the title (or a keyword) names a root AND the strip\'s products sit in that root (or the video has no strip and the title rule is one of the strong ones: exact, tail-slug, named).');
  md.push('- **Possible, Ali decides**: one signal only, or the two disagree. Nothing is written for these unless Ali ticks them.');
  md.push('- **None**: the the title resolved to no root and the strip is spread across roots (strategy videos). A video with no row is better than a video on the wrong page.');
  md.push('');
  md.push('## Coverage');
  md.push('');
  md.push(`- Published videos: ${videos.length}. With a product strip: ${rows.filter((r) => r.stripSize > 0).length}. With topic keywords: ${videos.filter((v) => v.aiTopicKeywords?.length).length}. Already carrying a category link by hand: ${videos.filter((v) => v.relatedCategorySlugs?.length).length}.`);
  md.push(`- Proposed with confidence: **${proposed.length}** videos, on **${rootsCovered.size}** distinct roots${proposedOwned.length ? ` (plus ${proposedOwned.length} whose root is customCategory-owned and renders no row, listed separately)` : ''}.`);
  md.push(`- Possible (Ali decides): ${possible.length}. None: ${none.length}.`);
  md.push(`- Roots that would gain a videos row: ${rootsCovered.size}; of those, ${[...rootsCovered].filter((r) => blogRootSet.has(r as string)).length} already show a Related Blogs row and ${[...rootsCovered].filter((r) => !blogRootSet.has(r as string)).length} would get their first related-content row.`);
  md.push(`- Video publish cadence (for the cache question): ${[...byMonth.entries()].sort().map(([m, n]) => `${m}: ${n}`).join(', ')}.`);
  md.push('');
  const table = (list: Proposal[]) => {
    md.push('| # | Video | Proposed root | Why | Evidence |');
    md.push('|---|---|---|---|---|');
    list.forEach((r, i) => {
      md.push(`| ${i + 1} | ${r.title.replace(/\|/g, '/')} (\`${r.slug}\`) | ${r.root ? `\`${r.root}\` (${r.rootH1})` : ''} | ${r.confidence} | ${r.evidence.join('<br>').replace(/\|/g, '/')} |`);
    });
    md.push('');
  };
  md.push(`## Proposed (${proposed.length})`);
  md.push('');
  table(proposed);
  if (proposedOwned.length) {
    md.push(`## Proposed, but the root is customCategory-owned and renders no Related row (${proposedOwned.length})`);
    md.push('');
    md.push('The owned page renders `CustomCategoryView`, which has no Related Blogs row and would have no Related Videos row either (the FIX-900 known gap). Writing the link does no harm and nothing today.');
    md.push('');
    table(proposedOwned);
  }
  md.push(`## Possible, Ali decides (${possible.length})`);
  md.push('');
  table(possible);
  md.push(`## None proposed (${none.length})`);
  md.push('');
  table(none);
  md.push('## Roots covered');
  md.push('');
  const perRoot = new Map<string, string[]>();
  for (const r of proposed) perRoot.set(r.root!, [...(perRoot.get(r.root!) ?? []), r.title]);
  for (const [root, titles] of [...perRoot.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    md.push(`- \`${root}\` (${h1(root)}): ${titles.length} video${titles.length === 1 ? '' : 's'}${blogRootSet.has(root) ? '' : ' (no Related Blogs row today)'}`);
  }
  md.push('');
  writeFileSync(join(outDir, 'VID-100-proposed-video-category-links.md'), md.join('\n') + '\n');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        approved: false,
        proposed: proposed.map((r) => ({ _id: r._id, slug: r.slug, title: r.title, root: r.root, confidence: r.confidence })),
        possible: possible.map((r) => ({ _id: r._id, slug: r.slug, title: r.title, root: r.root, confidence: r.confidence })),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ videos: videos.length, proposed: proposed.length, proposedOwned: proposedOwned.length, possible: possible.length, none: none.length, roots: rootsCovered.size, ownedRoots: owned.size, byMonth: [...byMonth.entries()].sort() }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

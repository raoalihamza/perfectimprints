/**
 * The AUTO-220 soak over EXISTING drafts: which of them may have a new header
 * picture drawn by the new engine, and the guard in front of every write.
 * PURE: no Sanity, no fs, no network, no next/*; the script
 * (scripts/blog-automation/soak-draft-headers.ts) does the reading, the
 * asking and the one patch, and decides nothing itself.
 *
 * Ali, 2026-11-15: "There are existing blog drafts the automation made,
 * carrying the old style of image. Regenerate those with the new engine."
 * His three hard limits, each a rule below and each proven in
 * soak-drafts.test.ts before anything is run:
 *
 *   1. DRAFTS ONLY. NOTHING PUBLISHED IS TOUCHED. The document's id must
 *      start with `drafts.`, AND no published copy of it may exist. A draft
 *      that sits over a published post is the next version of something
 *      live, so it is left alone too. "No published copy" must be an
 *      explicit false: a fact that could not be read is a refusal.
 *   2. ONLY DRAFTS THE AUTOMATION CREATED. The engine records the search
 *      topic it wrote a post from on the document, in the same create that
 *      makes it (`sourceTopic`, AUTO-117; the scheduler and the Blog Topics
 *      tab both go through the one function that writes it). A post Patrick
 *      started himself has no such record, whatever buttons he pressed on it
 *      afterwards, and is left completely alone.
 *   3. ONLY WHERE THE CURRENT HEADER IS ONE THE SITE MADE. The asset the
 *      draft points at NOW must be a picture this site generated, by the
 *      rule the removal code already uses (discard-header-image.ts
 *      `isGeneratedHeaderAsset`: the upload marker, or the exact fingerprint
 *      of a picture from before the marker existed). A picture he uploaded,
 *      or uploaded over one of ours (Studio keeps our old fields beside his
 *      asset, which is why the ASSET is what is judged), a library picture,
 *      a product photo shown from the catalogue and no picture at all are
 *      all refused. An asset document that cannot be read is refused.
 *
 * And one rule of housekeeping: a draft the new engine has already drawn for
 * (its header carries the copy without the P! mark) is not drawn for again,
 * so a run that stopped half way is continued by running it again, and a
 * second run spends nothing.
 *
 * THE WRITE GUARD (`soakWritePlan`). A picture takes half a minute to draw.
 * The draft is read again just before the write, and the write happens only
 * when that fresh read is STILL eligible and STILL points at the same asset
 * the picture was drawn to replace; the patch is pinned to that read's
 * revision, so an edit that lands in the last instant makes Sanity refuse it.
 * When the write is not made, the new picture is nobody's and is named for
 * removal. Only a picture the AI drew is ever written: a library picture or a
 * product photo never replaces a picture (the Studio buttons' own rule).
 */
import { headerAssetId, isGeneratedHeaderAsset, type HeaderAssetFacts } from './discard-header-image';

interface AssetRef {
  asset?: { _ref?: unknown } | null;
}

/** What the rules read about one blog post document. */
export interface SoakDraftFacts {
  _id: string;
  _rev?: string;
  /** True when a published document with this draft's id exists. Must be an explicit false for a draft to be eligible. */
  publishedCopyExists: boolean;
  sourceTopic?: { query?: unknown } | null;
  headerImage?: (AssetRef & { unmarkedImage?: AssetRef | null; untitledImage?: AssetRef | null }) | null;
  /** The asset DOCUMENT `headerImage.asset` points at, read in the same query; null when there is none. */
  headerAsset: HeaderAssetFacts | null;
}

/**
 * The GROQ projection that produces `SoakDraftFacts`, for a query in the RAW
 * perspective (so a draft and its published copy are both visible). One
 * string, so the script reads exactly what the rule was tested against.
 */
export const SOAK_DRAFT_FACTS = `{
  _id,
  _rev,
  "publishedCopyExists": count(*[_id == string::split(^._id, "drafts.")[1]]) > 0,
  sourceTopic{ query },
  headerImage{ asset, unmarkedImage{ asset }, untitledImage{ asset } },
  "headerAsset": headerImage.asset->{ _id, originalFilename, mimeType, "width": metadata.dimensions.width, "height": metadata.dimensions.height, source }
}`;

export type SoakRefusal =
  | 'not-a-draft'
  | 'published'
  | 'not-engine-made'
  | 'no-generated-header'
  | 'asset-unreadable'
  | 'header-not-ours'
  | 'already-new-engine';

export type SoakVerdict = { eligible: true } | { eligible: false; reason: SoakRefusal; why: string };

const DRAFT_PREFIX = 'drafts.';

function refOf(image: AssetRef | null | undefined): string | null {
  return headerAssetId(image?.asset?._ref);
}

/** May the soak draw a new header picture for this document? Every rule must hold. */
export function soakDraftVerdict(doc: SoakDraftFacts | null | undefined): SoakVerdict {
  const no = (reason: SoakRefusal, why: string): SoakVerdict => ({ eligible: false, reason, why });
  if (!doc || typeof doc._id !== 'string' || !doc._id.startsWith(DRAFT_PREFIX) || doc._id.length <= DRAFT_PREFIX.length) {
    return no('not-a-draft', 'it is not a draft; a published post is never touched');
  }
  if (doc.publishedCopyExists !== false) {
    return no('published', 'a published copy of this post exists, so the draft is the next version of something live and is left alone');
  }
  const topic = doc.sourceTopic?.query;
  if (typeof topic !== 'string' || !topic.trim()) {
    return no('not-engine-made', 'it carries no record of a search topic, so the engine did not create it; a post written by hand is left alone');
  }
  const ref = refOf(doc.headerImage);
  if (!ref) return no('no-generated-header', 'it has no header picture of ours to replace (none at all, or a product photo shown from the catalogue)');
  if (!doc.headerAsset || doc.headerAsset._id !== ref) {
    return no('asset-unreadable', 'the header picture it points at could not be read, so it cannot be shown to be one the site made');
  }
  if (!isGeneratedHeaderAsset(doc.headerAsset)) {
    return no('header-not-ours', 'the picture on it was uploaded by hand or chosen from the library, not made by the site, so it stays exactly as it is');
  }
  if (refOf(doc.headerImage?.unmarkedImage)) {
    return no('already-new-engine', 'the new engine has already drawn its header picture');
  }
  return { eligible: true };
}

/** The part of the image route's answer the guard reads (the Studio buttons' `ImageOutcome`). */
export interface SoakOutcome {
  kind: 'asset' | 'url' | 'none';
  source?: 'ai' | 'library' | 'product';
  image?: {
    _type: 'image';
    asset: { _type: 'reference'; _ref: string };
    alt?: string;
    titleOnImage?: string;
    ladderRung?: number;
    editCount?: number;
    unmarkedImage?: { _type: 'image'; asset: { _type: 'reference'; _ref: string } };
  };
  url?: string;
  alt?: string;
}

export type SoakWritePlan =
  | {
      write: true;
      /** Always a `drafts.` id. */
      draftId: string;
      /** The revision of the read made just before the write; Sanity refuses the patch if the draft has changed since. */
      ifRevisionId: string;
      set: { headerImage: NonNullable<SoakOutcome['image']> };
      unset: string[];
      /** The picture this replaces and the copy kept beside it, for the guarded removal rule AFTER the write. */
      replacedRefs: string[];
    }
  | {
      write: false;
      reason: string;
      /** The picture just made and its copy without the mark, now nobody's, for the guarded removal rule. Empty when nothing of ours was made. */
      discardRefs: string[];
    };

/**
 * The guard in front of the one write. `before` is the draft as read before
 * the picture was asked for; `now` is the same document read again just
 * before writing (null when it no longer exists).
 */
export function soakWritePlan(args: { before: SoakDraftFacts; now: SoakDraftFacts | null | undefined; outcome: SoakOutcome | null | undefined }): SoakWritePlan {
  const { before, now, outcome } = args;
  const made = outcome?.kind === 'asset' && outcome.source === 'ai' && outcome.image ? outcome.image : null;
  const newRef = made ? headerAssetId(made.asset?._ref) : null;
  if (!made || !newRef) {
    return { write: false, reason: 'the engine made no picture of its own for this draft (a library picture or a product photo never replaces a picture)', discardRefs: [] };
  }
  const copyRef = headerAssetId(made.unmarkedImage?.asset?._ref);
  const discardRefs = [newRef, ...(copyRef && copyRef !== newRef ? [copyRef] : [])];
  const refuse = (reason: string): SoakWritePlan => ({ write: false, reason, discardRefs });

  if (!now) return refuse('the draft no longer exists (it was published or deleted while the picture was being drawn)');
  if (now._id !== before._id) return refuse('the document read before the write is not the one the picture was drawn for');
  const verdict = soakDraftVerdict(now);
  if (verdict.eligible === false) {
    return refuse(
      verdict.reason === 'header-not-ours'
        ? 'a picture was uploaded onto the draft while the new one was being drawn, so the draft keeps it and the new picture is not used'
        : `the draft changed while the picture was being drawn: ${verdict.why}`,
    );
  }
  const oldRef = refOf(before.headerImage);
  if (!oldRef || refOf(now.headerImage) !== oldRef) {
    return refuse('the header picture on the draft changed while the new one was being drawn, so the draft keeps what it has now');
  }
  if (typeof now._rev !== 'string' || !now._rev) return refuse('the draft has no revision to pin the write to');

  const oldCopies = [refOf(now.headerImage?.untitledImage), refOf(now.headerImage?.unmarkedImage)].filter((r): r is string => Boolean(r) && r !== oldRef);
  return {
    write: true,
    draftId: now._id,
    ifRevisionId: now._rev,
    set: { headerImage: made },
    unset: ['externalHeaderImage'],
    replacedRefs: [oldRef, ...oldCopies.filter((r, i) => oldCopies.indexOf(r) === i)],
  };
}

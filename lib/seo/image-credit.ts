/**
 * SNIP-172: the one image credit this business can state truthfully.
 *
 * SNIP-170 concluded that no image metadata could be emitted at all, and
 * SNIP-171 re-tested that against the live Searchspring API and the live Sanity
 * dataset. Both findings stand for three of Google's four qualifying fields and
 * are NOT being overturned here. What changes is that the four were treated as
 * one decision when they are not:
 *
 *  - `creator` says WE MADE THIS IMAGE. Not true of anything on this site
 *    except its own marks. Never emitted.
 *  - `copyrightNotice` says WE OWN THIS IMAGE. Patrick has said plainly that
 *    these belong to the suppliers, and on the one Adobe Stock blog header it
 *    would breach a paid licence. Never emitted.
 *  - `license` is what produces Google's Licensable badge, whose documented
 *    purpose is to route viewers into licensing enquiries. Patrick declined
 *    those in as many words, and we could not grant rights in a supplier's
 *    photograph anyway. Never emitted, and that is not negotiable.
 *  - `creditText` says WHO IS CREDITED FOR THIS IMAGE WHEN IT IS PUBLISHED
 *    (Google's own wording). That is an attribution, not an ownership claim,
 *    and for one group of images it can be stated from a fact the URL itself
 *    carries.
 *
 * Google requires `contentUrl` plus at least ONE of the four, so `creditText`
 * alone makes the markup eligible.
 *
 * THE ONE TRUE CREDIT: GEIGER, DERIVED FROM THE HOST.
 *
 * Every product photograph in the scraped catalog is served by Geiger from
 * Geiger's own image host. Measured 2026-08-28 over every scraped record in
 * products.json, deals.json, new-products.json, rush-products.json and
 * catalogs.json: 9,602 of 9,602 image URLs are on `imgsirv.geiger.com`, with
 * no second host anywhere. Perfect Imprints is an authorised Geiger distributor
 * and hot-links those assets with permission (CLAUDE.md section 8). So "this
 * image is credited to Geiger" is a statement about where the published asset
 * comes from, it is checkable by anyone who reads the URL, and it claims
 * neither authorship nor ownership.
 *
 * The credit is derived from the HOST rather than from a stored field on
 * purpose. There is nothing to fill in, nothing to keep in step, and nothing
 * that can quietly go stale: if an image is not served by Geiger, it does not
 * get the Geiger credit, and that is decided at the moment the markup is built.
 * It also fails safe - a future image from a new host silently gets no credit
 * rather than an inherited wrong one.
 *
 * WHY NOT CREDIT THE BRAND, WHICH WAS THE OBVIOUS IDEA. The `brand` field is
 * the brand of the PRODUCT, not the source of the PHOTOGRAPH, and the data says
 * so plainly. It is present on 1,569 of 9,602 records (16.3%), and across its
 * 210 distinct values it carries a misspelling that names a company which does
 * not exist (`Oakely`, 2 records, alongside `Oakley`, 4), a technology
 * trademark belonging to a firm that made neither the product nor the picture
 * (`MAGSAFE`), product line names rather than organisations (`Souvenir`,
 * `AWARE`, `FOAM`, `Hip`, `Reach`, `Wink`), and ten organisations spelled two
 * ways each (KOOZIE/Koozie, OGIO/Ogio, YETI/Yeti, JanSport/Jansport,
 * ShedRain/Shedrain, RocketBook/Rocketbook, Fill It Forward/Fill IT Forward,
 * Otter Box, Port & Co, Travis & Wells). Emitting that as a credit line would
 * credit a company that does not exist, and would credit two names for one
 * organisation. The brand is already emitted, correctly, as `Product.brand`,
 * which is what it actually describes.
 *
 * WHAT GETS NO CREDIT, AND WHY THAT IS THE POINT. Anything not served by
 * Geiger keeps the plain URL string it has always had. That is not an
 * oversight, it is the rule doing its job:
 *
 *  - Patrick's own uploaded product images (cdn.sanity.io). He owns the upload,
 *    but SNIP-171 established the photographs are supplier catalogue assets:
 *    of 463 images on his 153 published product pages, ZERO carry a
 *    camera-style filename and 42% carry the document's own supplier item
 *    number in the filename. Crediting Perfect Imprints would credit the wrong
 *    party, and the right party is unknown per image. Nothing in Sanity records
 *    it either - re-verified 2026-08-28 across all 2,290 image assets in the
 *    dataset: 0 have a `source` object and 0 have a `creditLine`.
 *  - Blog header and inline images, page and landing-page images: same, and one
 *    of them is licensed stock (`adobestock_319427928_720.jpg`, the header of
 *    /blog/reason-to-consider-work-at-home-earbuds, which reaches JSON-LD as
 *    `BlogPosting.image`). A credit there would be Adobe's to state, not ours.
 *    The host rule excludes it without needing a special case, which is the
 *    safest way for an exclusion to work.
 *
 * See docs/product-snippets/SNIP-172-image-credit.md for the full evidence, and
 * lib/seo/image-metadata.test.ts for the guard that keeps the three forbidden
 * fields out and keeps this rule honest.
 */

/**
 * The credited organisation for a Geiger-served image. A bare organisation
 * name, matching Google's own definition ("the name of the person and/or
 * organization that is credited for the image when it's published") and the
 * shape of their example, which is `"creditText": "Labrador PhotoLab"`.
 */
export const GEIGER_IMAGE_CREDIT = 'Geiger';

/** Parsed lowercase host, or null when the value is not an absolute URL. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/**
 * True when this URL is served by Geiger. Parsed as a URL rather than matched
 * as a substring, so `https://evil.test/?x=imgsirv.geiger.com`,
 * `https://imgsirv.geiger.com.evil.test/x.jpg` and
 * `https://imgsirv.geiger.com@evil.test/x.jpg` are all correctly NOT Geiger.
 *
 * Any host under geiger.com counts, not just the `imgsirv` one every catalog
 * record uses today, because `patrickblack.geiger.com` (the affiliate host) is
 * equally Geiger-served and a second image host would be too.
 */
function isGeigerHosted(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return host === 'geiger.com' || host.endsWith('.geiger.com');
}

/**
 * The organisation credited for this image, or null when there is no true
 * credit available. Null is the normal, expected answer for every image this
 * business did not obtain from Geiger.
 */
export function imageCreditFor(url: string | null | undefined): string | null {
  if (!url) return null;
  return isGeigerHosted(url) ? GEIGER_IMAGE_CREDIT : null;
}

/** Google's image metadata shape: contentUrl plus one qualifying property. */
export interface CreditedImage {
  '@type': 'ImageObject';
  contentUrl: string;
  creditText: string;
}

/**
 * The value a schema `image` property should carry: a credited `ImageObject`
 * when a true credit exists, and otherwise the plain URL string that has always
 * been emitted. Never an `ImageObject` carrying only a `contentUrl` - that
 * shape is eligible for nothing and would be strictly more bytes for no gain.
 *
 * Returns null for a missing image so the caller omits the property entirely
 * rather than emitting an empty one.
 */
export function schemaImage(url: string | null | undefined): string | CreditedImage | null {
  if (!url) return null;
  const creditText = imageCreditFor(url);
  if (!creditText) return url;
  return { '@type': 'ImageObject', contentUrl: url, creditText };
}

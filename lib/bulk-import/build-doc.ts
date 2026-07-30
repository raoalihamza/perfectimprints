/**
 * Bulk Product Page import — parsed row → Sanity `productPage` field values
 * (P2-CP-003). PURE: image fetching/uploading happens in the route; this module
 * receives the finished `imageUrl → asset _id` map and only assembles the field
 * shapes, exactly matching sanity/schemas/documents/product-page.ts (typed
 * array items with stable `_key`s — never an "invalid item").
 *
 * Only the columns that had a value are present in the result, so an UPDATE
 * never overwrites an existing field with a blank cell.
 */

import { plainTextToBlocks } from '../portable-text/html-to-blocks';
import type { ParsedRow } from './parse';

/** Sanity image member as stored on defaultImages[] / colorVariants[].images[]. */
interface ImageMember {
  _type: 'image';
  _key: string;
  asset: { _type: 'reference'; _ref: string };
  alt: string;
}

function imageMembers(
  urls: string[],
  assetIds: Map<string, string>,
  keyPrefix: string,
  alt: string,
): ImageMember[] {
  const out: ImageMember[] = [];
  urls.forEach((url, i) => {
    const assetId = assetIds.get(url);
    if (!assetId) return; // fetch/upload failed — reported as a row warning by the route
    out.push({
      _type: 'image',
      _key: `${keyPrefix}-${i + 1}`,
      asset: { _type: 'reference', _ref: assetId },
      alt,
    });
  });
  return out;
}

/**
 * Build the `set` payload for a create/update. `assetIds` maps every image URL
 * that was successfully uploaded to its Sanity asset document id.
 */
export function buildProductPageSetFields(
  row: ParsedRow,
  assetIds: Map<string, string>,
): Record<string, unknown> {
  const f = row.fields;
  const set: Record<string, unknown> = { title: row.title };

  if (f.brand !== undefined) set.brand = f.brand;
  if (f.sku !== undefined) set.sku = f.sku;
  if (f.descriptionText !== undefined) set.description = plainTextToBlocks(f.descriptionText);
  if (f.onSale !== undefined) set.onSale = f.onSale;
  if (f.salePercentOff !== undefined) set.salePercentOff = f.salePercentOff;
  if (f.minQty !== undefined) set.minQty = f.minQty;
  if (f.setupCharge !== undefined) set.setupCharge = f.setupCharge;
  if (f.productionTime !== undefined) set.productionTime = f.productionTime;
  if (f.showInNewProducts !== undefined) set.showInNewProducts = f.showInNewProducts;
  if (f.leadRecipient !== undefined) set.leadRecipient = f.leadRecipient;
  if (f.relatedCategorySlug !== undefined) set.relatedCategorySlug = f.relatedCategorySlug;
  if (f.addToCategories !== undefined) set.addToCategories = f.addToCategories;
  if (f.relatedKeywords !== undefined) set.relatedKeywords = f.relatedKeywords;
  if (f.material !== undefined) set.material = f.material;
  if (f.features !== undefined) set.features = f.features;
  if (f.types !== undefined) set.types = f.types;
  if (f.madeInUsa !== undefined) set.madeInUsa = f.madeInUsa;
  if (f.ecoFriendly !== undefined) set.ecoFriendly = f.ecoFriendly;
  if (f.closeout !== undefined) set.closeout = f.closeout;
  if (f.unitsPerCarton !== undefined) set.unitsPerCarton = f.unitsPerCarton;
  if (f.cartonWeight !== undefined) set.cartonWeight = f.cartonWeight;
  if (f.cartonWidth !== undefined) set.cartonWidth = f.cartonWidth;
  if (f.cartonHeight !== undefined) set.cartonHeight = f.cartonHeight;
  if (f.cartonDepth !== undefined) set.cartonDepth = f.cartonDepth;
  if (f.fobZip !== undefined) set.fobZip = f.fobZip;
  if (f.fobCity !== undefined) set.fobCity = f.fobCity;
  if (f.fobState !== undefined) set.fobState = f.fobState;
  if (f.sizes !== undefined) set.sizes = f.sizes;

  if (f.pricingTiers !== undefined) {
    set.pricingTiers = f.pricingTiers.map((t, i) => ({
      _type: 'pricingTier',
      _key: `tier-${i + 1}`,
      minQty: t.minQty,
      price: t.price,
    }));
  }

  if (f.decorationMethods !== undefined) {
    set.decorationMethods = f.decorationMethods.map((d, i) => ({
      _type: 'decorationMethod',
      _key: `dec-${i + 1}`,
      method: d.method,
      ...(d.upcharge !== undefined ? { upcharge: d.upcharge } : {}),
      // 0 is a real stored value here ("no setup fee for this method"); only a
      // blank cell is omitted so the product-level Setup Charge keeps applying.
      ...(d.setupCharge !== undefined ? { setupCharge: d.setupCharge } : {}),
    }));
  }

  if (f.defaultImageUrls !== undefined) {
    set.defaultImages = imageMembers(f.defaultImageUrls, assetIds, 'img', row.title);
  }

  if (f.colorVariants !== undefined) {
    set.colorVariants = f.colorVariants.map((c, i) => ({
      _type: 'productColorVariant',
      _key: `color-${i + 1}`,
      colorName: c.colorName,
      ...(c.swatchHex !== undefined ? { swatchHex: c.swatchHex } : {}),
      images: imageMembers(c.imageUrls, assetIds, `color-${i + 1}-img`, `${row.title} — ${c.colorName}`),
    }));
  }

  return set;
}

/** Every image URL a row wants uploaded (default images + all color variants). */
export function collectRowImageUrls(row: ParsedRow): string[] {
  const urls = new Set<string>();
  for (const u of row.fields.defaultImageUrls ?? []) urls.add(u);
  for (const c of row.fields.colorVariants ?? []) for (const u of c.imageUrls) urls.add(u);
  return [...urls];
}

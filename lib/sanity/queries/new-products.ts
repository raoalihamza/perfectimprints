import { client } from '@/lib/sanity/client';

export interface NewProductsPageCopy {
  heading?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  hiddenNewProductSkus?: string[];
  pinnedNewProductSkus?: string[];
}

const NEW_PRODUCTS_COPY_QUERY = `*[_type == "globalSettings"][0].newProductsPage{
  heading,
  intro,
  metaTitle,
  metaDescription,
  hiddenNewProductSkus,
  pinnedNewProductSkus
}`;

export async function getNewProductsPageCopy(): Promise<NewProductsPageCopy> {
  try {
    const result = await client.fetch<NewProductsPageCopy | null>(NEW_PRODUCTS_COPY_QUERY);
    return result ?? {};
  } catch {
    return {};
  }
}

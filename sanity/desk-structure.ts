import type { StructureResolver } from 'sanity/structure';

const SINGLETON_TYPES = new Set(['homePage', 'globalSettings', 'megaMenu']);

/**
 * Quote documents are grouped under one "Quotes" item (Q-130) instead of
 * sitting as two separate entries in the alphabetical type list. Patrick works
 * on quotes as a task ("build a quote", "see what a customer said"), not by
 * document type, and the customer responses are a read-only audit trail that
 * belongs beside the quotes rather than filed under Q.
 */
const QUOTE_TYPES = new Set(['quote', 'quoteResponse']);

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Home Page')
        .id('homePage')
        .child(S.document().schemaType('homePage').documentId('homePage')),
      S.listItem()
        .title('Global Settings')
        .id('globalSettings')
        .child(S.document().schemaType('globalSettings').documentId('globalSettings')),
      S.listItem()
        .title('Mega Menu')
        .id('megaMenu')
        .child(S.document().schemaType('megaMenu').documentId('megaMenu')),
      S.divider(),
      S.listItem()
        .title('Quotes')
        .id('quotes')
        .child(
          S.list()
            .title('Quotes')
            .items([
              S.listItem()
                .title('All quotes (newest first)')
                .id('allQuotes')
                .child(
                  S.documentTypeList('quote')
                    .title('All quotes (newest first)')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }]),
                ),
              S.listItem()
                .title('Customer responses')
                .id('quoteResponses')
                .child(
                  S.documentTypeList('quoteResponse')
                    .title('Customer responses (newest first)')
                    .defaultOrdering([{ field: 'createdAt', direction: 'desc' }]),
                ),
            ]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter((listItem) => {
        const id = listItem.getId() ?? '';
        return !SINGLETON_TYPES.has(id) && !QUOTE_TYPES.has(id);
      }),
    ]);

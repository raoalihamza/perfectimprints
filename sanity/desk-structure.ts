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

/**
 * Portfolio Gallery (PORT-100): the items and their categories sit together
 * under one "Portfolio" item, for the same reason the quotes do. Patrick adds
 * a job and files it under a category in one sitting; two entries filed under
 * P in the long type list would separate the two halves of that task.
 */
const PORTFOLIO_TYPES = new Set(['portfolioItem', 'portfolioCategory']);

/**
 * Blog automation (AUTO-208): the scheduler's run log sits under its own item
 * near the top, newest first, so Patrick can see what the engine did last
 * night without hunting for a type filed under B. Read only; the morning
 * email carries the same facts.
 */
const RUN_LOG_TYPES = new Set(['blogAutomationRun']);

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
        .title('Blog automation runs')
        .id('blogAutomationRuns')
        .child(
          S.documentTypeList('blogAutomationRun')
            .title('Blog automation runs (newest first)')
            .defaultOrdering([{ field: 'claimedAt', direction: 'desc' }]),
        ),
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
              // The two "needs attention" panes (Q-150). Deliberately separate
              // LISTS rather than a badge on every row in "All quotes": a
              // quote's response state lives in other documents, and Sanity's
              // list preview cannot join across documents, so showing it inline
              // would mean a query per row. This costs ONE query, only when
              // Patrick opens the pane, and the main list stays exactly as fast
              // as it was.
              S.listItem()
                .title('Accepted by customer')
                .id('quotesAccepted')
                .child(
                  S.documentList()
                    .title('Accepted by customer')
                    .schemaType('quote')
                    .filter(
                      '_type == "quote" && _id in *[_type == "quoteResponse" && kind == "accepted"].quote._ref',
                    )
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }]),
                ),
              S.listItem()
                .title('Change requested')
                .id('quotesRevisionRequested')
                .child(
                  S.documentList()
                    .title('Change requested')
                    .schemaType('quote')
                    .filter(
                      '_type == "quote" && _id in *[_type == "quoteResponse" && kind == "revisionRequested"].quote._ref',
                    )
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
      S.listItem()
        .title('Portfolio')
        .id('portfolio')
        .child(
          S.list()
            .title('Portfolio')
            .items([
              S.listItem()
                .title('Portfolio items')
                .id('portfolioItems')
                .child(
                  S.documentTypeList('portfolioItem')
                    .title('Portfolio items (gallery order)')
                    .defaultOrdering([
                      { field: 'featured', direction: 'desc' },
                      { field: 'displayOrder', direction: 'asc' },
                      { field: '_createdAt', direction: 'desc' },
                    ]),
                ),
              S.listItem()
                .title('Portfolio categories')
                .id('portfolioCategories')
                .child(
                  S.documentTypeList('portfolioCategory')
                    .title('Portfolio categories (filter order)')
                    .defaultOrdering([
                      { field: 'displayOrder', direction: 'asc' },
                      { field: 'title', direction: 'asc' },
                    ]),
                ),
            ]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter((listItem) => {
        const id = listItem.getId() ?? '';
        return !SINGLETON_TYPES.has(id) && !QUOTE_TYPES.has(id) && !PORTFOLIO_TYPES.has(id) && !RUN_LOG_TYPES.has(id);
      }),
    ]);

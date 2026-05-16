import type { StructureResolver } from 'sanity/structure';

const SINGLETON_TYPES = new Set(['homePage', 'globalSettings', 'megaMenu']);

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
      ...S.documentTypeListItems().filter(
        (listItem) => !SINGLETON_TYPES.has(listItem.getId() ?? ''),
      ),
    ]);

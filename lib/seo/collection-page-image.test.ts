/**
 * IMG-120: the CollectionPage image boundary. On a category whose first grid
 * product is one of Patrick's own (live example: /cat/pens), the
 * representative image handed to `collectionPageSchema` is a Sanity card URL
 * that now carries `auto=format` for the <img>. The schema copy must not.
 */
import { describe, expect, it } from 'vitest';

import { collectionPageSchema } from './schema-generators';

describe('collectionPageSchema image', () => {
  it('strips auto=format from a Sanity image and keeps everything else', () => {
    const schema = collectionPageSchema({
      name: 'Pens',
      url: 'https://www.perfectimprints.com/cat/pens',
      image:
        'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1500.jpg?w=1200&fit=max&auto=format',
    });
    expect(schema.image).toBe(
      'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1500.jpg?w=1200&fit=max',
    );
  });

  it('leaves a Geiger image byte-identical', () => {
    const geiger =
      'https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200';
    const schema = collectionPageSchema({ name: 'Water Bottles', url: '/cat/water-bottles', image: geiger });
    expect(schema.image).toBe(geiger);
  });

  it('omits the image key entirely when there is no image', () => {
    const schema = collectionPageSchema({ name: 'Empty', url: '/cat/empty' });
    expect('image' in schema).toBe(false);
  });
});

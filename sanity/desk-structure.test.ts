import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOG_POST_DRAFTS_FILTER, BLOG_POST_HAS_DRAFT, BLOG_POST_PUBLISHED_FILTER } from './desk-structure';

const source = readFileSync(join(process.cwd(), 'sanity/desk-structure.ts'), 'utf8');
// Comments stripped, so a rule can be explained in a comment without tripping its own test.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Blog Post lists by publish state (2026-11-15)', () => {
  // Measured on the live dataset: Sanity 3.99 runs every list under the "drafts"
  // perspective, where a draft is shown under its PUBLISHED id, so the classic
  // `_id in path("drafts.**")` matches 0 of 138 drafts there. `_originalId` is
  // what still says "this is a draft" (138), and `_id` is the belt for a read
  // that carries no `_originalId`.
  it('reads the draft state from _originalId first, never from _id alone', () => {
    expect(BLOG_POST_HAS_DRAFT).toBe('coalesce(_originalId, _id) in path("drafts.**")');
    expect(code).not.toMatch(/&&\s*_id in path\("drafts\.\*\*"\)/);
  });

  it('the two lists are exact opposites, so every post is in one of them and none is in both', () => {
    expect(BLOG_POST_DRAFTS_FILTER).toBe(`_type == $type && ${BLOG_POST_HAS_DRAFT}`);
    expect(BLOG_POST_PUBLISHED_FILTER).toBe(`_type == $type && !(${BLOG_POST_HAS_DRAFT})`);
  });

  it('Blog Post opens three lists: drafts, published, and all of them as before', () => {
    for (const id of ['blogPostDrafts', 'blogPostPublished', 'blogPostAll']) expect(code).toContain(`.id('${id}')`);
    expect(code).toContain('.filter(BLOG_POST_DRAFTS_FILTER)');
    expect(code).toContain('.filter(BLOG_POST_PUBLISHED_FILTER)');
    // Built from the type list, so the sort menu (the three dots) keeps the post's own orderings.
    expect(code.match(/S\.documentTypeList\('blogPost'\)/g)).toHaveLength(3);
  });

  it('a link that opens a post lands in the list of all posts, never in a filtered one that may not hold it', () => {
    expect(code.match(/\.canHandleIntent\(\(\) => false\)/g)).toHaveLength(2);
  });

  it('only the Blog Post item is replaced; every other type keeps its generated list', () => {
    expect(code).toContain("listItem.getId() === 'blogPost' ? listItem.child(blogPostLists(S)) : listItem");
  });
});

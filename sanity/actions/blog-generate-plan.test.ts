/**
 * AUTO-116: the rules behind the two blog AI buttons. The FILL button must be
 * unable to overwrite a field that has anything in it; the REGENERATE button
 * replaces, but title and slug move together or not at all, and anything
 * edited during the wait is kept.
 */
import { describe, expect, it } from 'vitest';
import {
  BLOG_CONTENT_FIELDS,
  emptyContentFields,
  planFill,
  planRegenerate,
  previewRegenerate,
  slugifyTitle,
  titleSlugPlan,
  type BlogDocFields,
  type BlogPatchPlan,
} from './blog-generate-plan';

const block = (text: string, key = 'b1') => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
});
const imageBlock = { _type: 'image', _key: 'img1', asset: { _ref: 'image-abc-800x600-jpg' } };
const openedButUntyped = [block('')];

const generated = {
  title: 'Custom Water Bottles for Busy Teams',
  metaTitle: 'AI meta title',
  metaDescription: 'AI meta description',
  excerpt: 'AI excerpt',
  body: [block('AI body')],
};

/** Patrick's own non-empty value for each field the buttons can write. */
const mine: Required<Pick<BlogDocFields, 'metaTitle' | 'metaDescription' | 'excerpt' | 'body'>> = {
  metaTitle: 'My meta title',
  metaDescription: 'My meta description',
  excerpt: 'My excerpt',
  body: [block('My paragraph'), imageBlock],
};

const emptyDoc: BlogDocFields = { title: 'Water bottles' };

/** The final title and slug after a plan is applied to `doc`. */
function applied(doc: BlogDocFields, plan: BlogPatchPlan) {
  const title = (plan.set.title as string | undefined) ?? (doc.title as string | undefined) ?? '';
  const slug = (plan.set.slug as { current: string } | undefined)?.current ?? (doc.slug?.current as string | undefined) ?? '';
  return { title, slug };
}

describe('FILL ("Generate Blog with AI")', () => {
  it.each(BLOG_CONTENT_FIELDS)('never overwrites a non-empty %s', (field) => {
    const doc: BlogDocFields = { ...emptyDoc, [field]: mine[field] };
    const plan = planFill(doc, doc, generated);
    expect(field in plan.set).toBe(false);
    expect(plan.kept).toContainEqual({ field, why: 'not-empty' });
    // Every OTHER empty field is filled.
    for (const other of BLOG_CONTENT_FIELDS.filter((f) => f !== field)) expect(plan.set[other]).toEqual(generated[other]);
  });

  it('never overwrites the title, even though the AI always returns one', () => {
    const plan = planFill(emptyDoc, emptyDoc, generated);
    expect('title' in plan.set).toBe(false);
    expect(plan.kept).toContainEqual({ field: 'title', why: 'title-is-input' });
  });

  it('never overwrites a slug that is set', () => {
    const doc = { ...emptyDoc, slug: { current: 'my-hand-made-slug' } };
    const plan = planFill(doc, doc, generated);
    expect('slug' in plan.set).toBe(false);
  });

  it('with every field full, writes nothing at all', () => {
    const doc: BlogDocFields = { ...emptyDoc, slug: { current: 'x' }, ...mine };
    expect(emptyContentFields(doc)).toEqual([]);
    expect(planFill(doc, doc, generated).set).toEqual({});
    expect(planFill(doc, doc, null).set).toEqual({});
  });

  it('treats an opened but untyped body as empty, and a body holding only an image as not empty', () => {
    expect(emptyContentFields({ ...emptyDoc, ...mine, body: openedButUntyped })).toEqual(['body']);
    expect(emptyContentFields({ ...emptyDoc, ...mine, body: [imageBlock] })).toEqual([]);
  });

  it('keeps a field Patrick typed into DURING the wait (it was empty at the click)', () => {
    for (const field of BLOG_CONTENT_FIELDS) {
      const now: BlogDocFields = { ...emptyDoc, [field]: mine[field] };
      const plan = planFill(emptyDoc, now, generated);
      expect(field in plan.set).toBe(false);
      expect(plan.kept).toContainEqual({ field, why: 'edited-during-generation' });
    }
    const slugTyped = planFill(emptyDoc, { ...emptyDoc, slug: { current: 'typed' } }, generated);
    expect('slug' in slugTyped.set).toBe(false);
  });

  it('fills an empty slug from the title that STAYS, so the two agree', () => {
    const plan = planFill(emptyDoc, emptyDoc, generated);
    expect(plan.set.slug).toEqual({ _type: 'slug', current: 'water-bottles' });
    expect(applied(emptyDoc, plan).slug).toBe(slugifyTitle(applied(emptyDoc, plan).title));
  });

  it('does not write a field the AI left blank', () => {
    const plan = planFill(emptyDoc, emptyDoc, { ...generated, excerpt: '  ' });
    expect('excerpt' in plan.set).toBe(false);
    expect(plan.kept).toContainEqual({ field: 'excerpt', why: 'ai-left-blank' });
  });
});

describe('REGENERATE ("Regenerate Blog with AI")', () => {
  const draft: BlogDocFields = { title: 'Water bottles', slug: { current: 'water-bottles' }, ...mine };

  it('replaces the AI fields, and title and slug together, on a never-published draft whose slug is the title slug', () => {
    const plan = planRegenerate(draft, draft, generated, { atClick: false, now: false });
    expect(plan.set).toMatchObject({
      title: generated.title,
      slug: { _type: 'slug', current: slugifyTitle(generated.title) },
      metaTitle: generated.metaTitle,
      metaDescription: generated.metaDescription,
      excerpt: generated.excerpt,
      body: generated.body,
    });
    expect(plan.replaced.sort()).toEqual(['body', 'excerpt', 'metaDescription', 'metaTitle', 'slug', 'title']);
  });

  it('keeps title AND slug on a published post (its address must not change)', () => {
    const plan = planRegenerate(draft, draft, generated, { atClick: true, now: true });
    expect('title' in plan.set).toBe(false);
    expect('slug' in plan.set).toBe(false);
    expect(plan.kept).toContainEqual({ field: 'title', why: 'live' });
    // It became published during the wait: still kept.
    const late = planRegenerate(draft, draft, generated, { atClick: false, now: true });
    expect('title' in late.set || 'slug' in late.set).toBe(false);
  });

  it('keeps title AND slug when the slug was set by hand', () => {
    const doc = { ...draft, slug: { current: 'best-bottles-2026' } };
    const plan = planRegenerate(doc, doc, generated, { atClick: false, now: false });
    expect('title' in plan.set || 'slug' in plan.set).toBe(false);
    expect(plan.kept).toContainEqual({ field: 'title', why: 'hand-set-slug' });
  });

  it('keeps any field edited during the wait, and title+slug if either was edited', () => {
    for (const field of BLOG_CONTENT_FIELDS) {
      const now = { ...draft, [field]: field === 'body' ? [block('edited while waiting')] : 'edited while waiting' };
      const plan = planRegenerate(draft, now, generated, { atClick: false, now: false });
      expect(field in plan.set).toBe(false);
      expect(plan.kept).toContainEqual({ field, why: 'edited-during-generation' });
    }
    const titleEdited = planRegenerate(draft, { ...draft, title: 'Water bottles!' }, generated, { atClick: false, now: false });
    expect('title' in titleEdited.set || 'slug' in titleEdited.set).toBe(false);
  });

  it('the confirmation names every field it will replace, and what it keeps', () => {
    expect(previewRegenerate(draft, false)).toEqual({
      replace: ['title', 'slug', 'metaTitle', 'metaDescription', 'excerpt', 'body'],
      fill: [],
      keep: [],
    });
    expect(previewRegenerate(draft, true).keep.map((k) => k.field)).toEqual(['title', 'slug']);
    expect(previewRegenerate(emptyDoc, false)).toEqual({
      replace: ['title'],
      fill: ['slug', 'metaTitle', 'metaDescription', 'excerpt', 'body'],
      keep: [],
    });
  });
});

describe('title and slug can never end up mismatched by either button', () => {
  const docs: BlogDocFields[] = [
    emptyDoc,
    { title: 'Water bottles', slug: { current: 'water-bottles' } },
    { title: 'Water bottles', slug: { current: 'hand-set' } },
    { title: 'Water bottles', slug: { current: '' }, ...mine },
  ];
  it('whenever a button writes the title or the slug, the slug is the stored title slug', () => {
    for (const doc of docs) {
      for (const published of [false, true]) {
        for (const plan of [
          planFill(doc, doc, generated),
          planFill(doc, doc, null),
          planRegenerate(doc, doc, generated, { atClick: published, now: published }),
        ]) {
          if (!('title' in plan.set) && !('slug' in plan.set)) continue;
          const { title, slug } = applied(doc, plan);
          expect(slug).toBe(slugifyTitle(title));
        }
      }
    }
  });

  it('titleSlugPlan: replace only when unpublished and the slug is empty or the title slug', () => {
    expect(titleSlugPlan({ title: 'A B' }, false)).toEqual({ mode: 'replace' });
    expect(titleSlugPlan({ title: 'A B', slug: { current: 'a-b' } }, false)).toEqual({ mode: 'replace' });
    expect(titleSlugPlan({ title: 'A B', slug: { current: 'c' } }, false)).toEqual({ mode: 'keep', why: 'hand-set-slug' });
    expect(titleSlugPlan({ title: 'A B', slug: { current: 'a-b' } }, true)).toEqual({ mode: 'keep', why: 'live' });
  });
});

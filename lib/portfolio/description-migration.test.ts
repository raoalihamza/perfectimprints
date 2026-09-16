import { describe, expect, it } from 'vitest';

import { planDescriptionMigration } from './description-migration';

// PORT-210: what the migration script's dry run prints is this plan.
describe('planDescriptionMigration', () => {
  const richValue = [
    {
      _type: 'block',
      _key: 'b',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: 's', text: 'Done.', marks: [] }],
    },
  ];

  it('converts strings, unsets empty strings, skips arrays and absent values, and counts each', () => {
    const plan = planDescriptionMigration([
      { _id: 'a', title: 'Caps', description: 'Twelve caps.\n\nFront embroidery.' },
      { _id: 'b', title: 'Empty', description: '   ' },
      { _id: 'c', title: 'Rich', description: richValue },
      { _id: 'd', title: 'None' },
      { _id: 'e', title: 'Null', description: null },
      { _id: 'drafts.a', title: 'Caps', description: 'Twelve caps.' },
    ]);
    expect(plan.convert).toBe(2);
    expect(plan.unset).toBe(1);
    expect(plan.alreadyRich).toBe(1);
    expect(plan.noDescription).toBe(2);
    expect(plan.actions.map((a) => a.kind)).toEqual(['convert', 'unset', 'skip', 'skip', 'skip', 'convert']);
    const first = plan.actions[0];
    if (first.kind !== 'convert') throw new Error('expected convert');
    expect(first.blocks.map((b) => b.children[0].text)).toEqual(['Twelve caps.', 'Front embroidery.']);
    expect(first.blocks.every((b) => b.markDefs.length === 0)).toBe(true);
  });

  it('is idempotent: a converted plan re-planned converts nothing', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      _id: `item-${i}`,
      title: `Job ${i}`,
      description: `Description ${i}.`,
    }));
    const first = planDescriptionMigration(rows);
    expect(first.convert).toBe(50);
    expect(first.alreadyRich).toBe(0);
    const after = rows.map((row, i) => {
      const action = first.actions[i];
      return { ...row, description: action.kind === 'convert' ? action.blocks : row.description };
    });
    const second = planDescriptionMigration(after);
    expect(second.convert).toBe(0);
    expect(second.unset).toBe(0);
    expect(second.alreadyRich).toBe(50);
  });

  it('never links anything', () => {
    const plan = planDescriptionMigration([
      { _id: 'a', description: 'See /products/caps at https://example.com today.' },
    ]);
    const action = plan.actions[0];
    if (action.kind !== 'convert') throw new Error('expected convert');
    expect(JSON.stringify(action.blocks)).not.toContain('link');
    expect(action.blocks[0].children[0].text).toBe('See /products/caps at https://example.com today.');
  });
});

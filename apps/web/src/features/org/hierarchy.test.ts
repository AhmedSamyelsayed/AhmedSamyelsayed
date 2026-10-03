import { describe, expect, it } from 'vitest';
import { buildTree, descendantsOf } from './hierarchy';

const items = [
  { id: 'ceo', parent: null, name: 'CEO' },
  { id: 'sm', parent: 'ceo', name: 'Sales' },
  { id: 'rep', parent: 'sm', name: 'Rep' },
  { id: 'hr', parent: 'ceo', name: 'HR' },
  { id: 'orphan', parent: 'missing', name: 'Orphan' },
];

describe('hierarchy', () => {
  it('finds a node and all its descendants', () => {
    expect([...descendantsOf(items, (i) => i.parent, 'sm')].sort()).toEqual(['rep', 'sm']);
    expect(descendantsOf(items, (i) => i.parent, 'ceo').size).toBe(4);
  });

  it('builds a sorted forest and promotes orphans to roots', () => {
    const tree = buildTree(
      items,
      (i) => i.parent,
      (i) => i.name,
    );
    expect(tree.map((n) => n.item.id)).toEqual(['ceo', 'orphan']);
    expect(tree[0]!.children.map((n) => n.item.id)).toEqual(['hr', 'sm']);
  });
});

/** Ids of a node and everything below it, given a child -> parent map. */
export function descendantsOf<T extends { id: string }>(
  items: T[],
  parentOf: (item: T) => string | null,
  rootId: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const item of items) {
    const p = parentOf(item);
    if (p) children.set(p, [...(children.get(p) ?? []), item.id]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const c of children.get(stack.pop()!) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

export interface TreeNode<T> {
  item: T;
  children: TreeNode<T>[];
}

/** Builds a forest; items whose parent is missing become roots. */
export function buildTree<T extends { id: string }>(
  items: T[],
  parentOf: (item: T) => string | null,
  sortKey: (item: T) => string,
): TreeNode<T>[] {
  const ids = new Set(items.map((i) => i.id));
  const nodes = new Map(items.map((i) => [i.id, { item: i, children: [] as TreeNode<T>[] }]));
  const roots: TreeNode<T>[] = [];
  for (const item of items) {
    const p = parentOf(item);
    const node = nodes.get(item.id)!;
    if (p && ids.has(p) && p !== item.id) nodes.get(p)!.children.push(node);
    else roots.push(node);
  }
  const sort = (list: TreeNode<T>[]) => {
    list.sort((a, b) => sortKey(a.item).localeCompare(sortKey(b.item)));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

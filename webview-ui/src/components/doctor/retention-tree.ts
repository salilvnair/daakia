/**
 * Which nodes go when one is collapsed.
 *
 * Pulled out of the view because it is the only part of collapsing that can be
 * wrong in a way you would not see: removing the direct children leaves
 * grandchildren stranded on the canvas with no edge to anything and no node
 * left that could close them.
 */
export interface TreeNode {
  row: number;
  parent: number | null;
}

/**
 * Everything reachable below `row`, excluding `row` itself.
 *
 * The visited set is a cycle guard, not an optimisation. A dominator tree is a
 * tree by construction, so a parent chain cannot loop — but this reads whatever
 * the worker sent, and a recursive walk over malformed data hangs the webview
 * rather than showing a wrong number.
 */
export function descendantsOf(row: number, all: TreeNode[]): Set<number> {
  const found = new Set<number>();
  const stack = [row];
  while (stack.length) {
    const parent = stack.pop()!;
    for (const n of all) {
      if (n.parent === parent && !found.has(n.row) && n.row !== row) {
        found.add(n.row);
        stack.push(n.row);
      }
    }
  }
  return found;
}

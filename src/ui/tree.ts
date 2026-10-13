import type { TreeNode } from "../lib/api";

/** Paths of the directories between `root` (exclusive) and `target`, outermost first. */
export function ancestorDirs(root: TreeNode, target: string): string[] {
  const walk = (node: TreeNode, trail: string[]): string[] | null => {
    for (const child of node.children) {
      if (child.path === target) return trail;
      if (child.isDir) {
        const found = walk(child, [...trail, child.path]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, []) ?? [];
}

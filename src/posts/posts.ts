import type { Tree, TreeNode } from "../lib/api";
import { isMarkdownPath } from "../lib/paths";

/** A UI hint only: Rust decides what may be written. */
export function isPostPath(path: string, postsFolder: string | null): boolean {
  return postsFolder !== null && path.startsWith(`${postsFolder.replace(/\/$/, "")}/`) && isMarkdownPath(path);
}

export function postFilesIn(tree: Tree): string[] {
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children) {
      if (child.isDir) walk(child);
      else if (isMarkdownPath(child.path)) out.push(child.path);
    }
  };
  walk(tree.root);
  return out;
}

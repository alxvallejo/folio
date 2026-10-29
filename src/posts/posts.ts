import type { Tree, TreeNode } from "../lib/api";
import { isMarkdownPath } from "../lib/paths";
import { readStatus, stripFrontmatter } from "./frontmatter";

/** A UI hint only: Rust decides what may be written. */
export function isPostPath(path: string, postsFolder: string | null): boolean {
  return postsFolder !== null && path.startsWith(`${postsFolder.replace(/\/$/, "")}/`) && isMarkdownPath(path);
}

/**
 * Whether the sidebar already shows the posts folder: it is the posts folder, a folder inside it,
 * or a folder holding it (such as ~/Documents/Folio around Posts and Reports).
 */
export function postsFolderShown(root: string | null, postsFolder: string | null): boolean {
  if (root === null || postsFolder === null) return false;
  const r = root.replace(/\/$/, "");
  const p = postsFolder.replace(/\/$/, "");
  return r === p || r.startsWith(`${p}/`) || p.startsWith(`${r}/`);
}

/** Posts open for writing, unless they aren't valid UTF-8: saving would replace the undecodable bytes. */
export function writingModeFor(path: string, postsFolder: string | null, lossy: boolean): boolean {
  return !lossy && isPostPath(path, postsFolder);
}

// A "word" has a letter or digit in it, so list bullets, "#" and "—" don't count.
const WORDLIKE = /[\p{L}\p{N}]/u;

/** Words in the body after the frontmatter, split on whitespace. */
export function wordCount(text: string): number {
  return stripFrontmatter(text)
    .split(/\s+/)
    .filter((w) => WORDLIKE.test(w)).length;
}

/** The collapsed frontmatter line in writing mode, e.g. "Draft · 412 words". */
export function postLabel(text: string): string {
  const n = wordCount(text);
  return `${readStatus(text) === "published" ? "Published" : "Draft"} · ${n.toLocaleString("en-US")} ${n === 1 ? "word" : "words"}`;
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

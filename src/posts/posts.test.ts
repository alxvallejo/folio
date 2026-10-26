import { describe, expect, it } from "vitest";
import type { Tree, TreeNode } from "../lib/api";
import { isPostPath, postFilesIn } from "./posts";

const file = (path: string): TreeNode => ({ name: path.slice(path.lastIndexOf("/") + 1), path, isDir: false, children: [] });
const dir = (path: string, children: TreeNode[]): TreeNode => ({ name: path.slice(path.lastIndexOf("/") + 1), path, isDir: true, children });

describe("isPostPath", () => {
  it("accepts Markdown strictly under the posts folder", () => {
    expect(isPostPath("/u/Blog/a.md", "/u/Blog")).toBe(true);
    expect(isPostPath("/u/Blog/sub/b.markdown", "/u/Blog")).toBe(true);
  });

  it("rejects siblings with a shared prefix, other extensions and the folder itself", () => {
    expect(isPostPath("/u/Blog2/a.md", "/u/Blog")).toBe(false);
    expect(isPostPath("/u/Blog/a.txt", "/u/Blog")).toBe(false);
    expect(isPostPath("/u/Blog.md", "/u/Blog")).toBe(false);
  });

  it("is false without a posts folder", () => {
    expect(isPostPath("/u/Blog/a.md", null)).toBe(false);
  });
});

describe("postFilesIn", () => {
  it("lists nested Markdown files only", () => {
    const tree: Tree = {
      truncated: false,
      root: dir("/u/Blog", [file("/u/Blog/a.md"), file("/u/Blog/notes.txt"), dir("/u/Blog/sub", [file("/u/Blog/sub/b.markdown")])]),
    };
    expect(postFilesIn(tree)).toEqual(["/u/Blog/a.md", "/u/Blog/sub/b.markdown"]);
  });
});

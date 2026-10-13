import { describe, expect, it } from "vitest";
import type { TreeNode } from "../lib/api";
import { ancestorDirs } from "./tree";

const file = (path: string): TreeNode => ({ name: path.split("/").pop()!, path, isDir: false, children: [] });
const dir = (path: string, children: TreeNode[]): TreeNode => ({ name: path.split("/").pop()!, path, isDir: true, children });

const root = dir("/r", [dir("/r/docs", [dir("/r/docs/specs", [file("/r/docs/specs/a.md")])]), file("/r/README.md")]);

describe("ancestorDirs", () => {
  it("lists the dirs to expand to reveal a nested file", () => {
    expect(ancestorDirs(root, "/r/docs/specs/a.md")).toEqual(["/r/docs", "/r/docs/specs"]);
  });

  it("returns nothing for top-level files or files outside the tree", () => {
    expect(ancestorDirs(root, "/r/README.md")).toEqual([]);
    expect(ancestorDirs(root, "/elsewhere/x.md")).toEqual([]);
  });
});

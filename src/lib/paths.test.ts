import { describe, expect, it } from "vitest";
import { abbreviateHome, basename, dirname, expandHome, isMarkdownPath, normalize, resolvePath } from "./paths";

describe("paths", () => {
  it("splits dirname and basename", () => {
    expect(dirname("/a/b/c.md")).toBe("/a/b");
    expect(dirname("/c.md")).toBe("/");
    expect(basename("/a/b/c.md")).toBe("c.md");
  });

  it("normalizes dot segments", () => {
    expect(normalize("/a/./b/../c//d.md")).toBe("/a/c/d.md");
    expect(normalize("/a/../../b")).toBe("/b");
  });

  it("resolves relative and absolute targets", () => {
    expect(resolvePath("/notes/specs", "../plans/x.md")).toBe("/notes/plans/x.md");
    expect(resolvePath("/notes", "./img/a b.png")).toBe("/notes/img/a b.png");
    expect(resolvePath("/notes", "/abs/y.md")).toBe("/abs/y.md");
  });

  it("recognizes Markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("/a/README.MD")).toBe(true);
    expect(isMarkdownPath("/a/x.markdown")).toBe(true);
    expect(isMarkdownPath("/a/x.mdx")).toBe(false);
  });

  it("expands and abbreviates the home directory", () => {
    expect(expandHome("~/Sites/x", "/Users/alex")).toBe("/Users/alex/Sites/x");
    expect(expandHome("~", "/Users/alex/")).toBe("/Users/alex/");
    expect(expandHome("/tmp/x", "/Users/alex")).toBe("/tmp/x");
    expect(abbreviateHome("/Users/alex/Sites/x", "/Users/alex/")).toBe("~/Sites/x");
    expect(abbreviateHome("/Users/alexandra/x", "/Users/alex")).toBe("/Users/alexandra/x");
  });
});

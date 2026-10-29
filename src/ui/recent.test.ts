import { describe, expect, it } from "vitest";
import { forgetRecent, pushRecent, RECENT_LIMIT, renameRecent } from "./recent";

describe("pushRecent", () => {
  it("puts the path first and drops its older entry", () => {
    expect(pushRecent(["/a.md", "/b.md", "/c.md"], "/c.md")).toEqual(["/c.md", "/a.md", "/b.md"]);
    expect(pushRecent([], "/a.md")).toEqual(["/a.md"]);
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `/${i}.md`);
    const next = pushRecent(full, "/new.md");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("/new.md");
    expect(next).not.toContain(`/${RECENT_LIMIT - 1}.md`);
  });

  it("returns the same list when the path is already first", () => {
    const list = ["/a.md", "/b.md"];
    expect(pushRecent(list, "/a.md")).toBe(list);
  });
});

describe("renameRecent", () => {
  it("replaces the old path in place", () => {
    expect(renameRecent(["/a.md", "/Untitled.md", "/c.md"], "/Untitled.md", "/My post.md")).toEqual(["/a.md", "/My post.md", "/c.md"]);
  });

  it("drops a duplicate of the new path", () => {
    expect(renameRecent(["/old.md", "/new.md"], "/old.md", "/new.md")).toEqual(["/new.md"]);
  });

  it("returns the same list when the old path isn't in it", () => {
    const list = ["/a.md"];
    expect(renameRecent(list, "/x.md", "/y.md")).toBe(list);
  });
});

describe("forgetRecent", () => {
  it("removes the path", () => {
    expect(forgetRecent(["/a.md", "/b.md"], "/a.md")).toEqual(["/b.md"]);
  });

  it("returns the same list when the path isn't in it", () => {
    const list = ["/a.md"];
    expect(forgetRecent(list, "/b.md")).toBe(list);
  });
});

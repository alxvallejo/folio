import { describe, expect, it } from "vitest";
import { findFrontmatter, localDate, readStatus, setStatus, stripFrontmatter } from "./frontmatter";

const post = "---\nstatus: draft\ntags: [a]\n---\n\n# Title\n";

describe("frontmatter", () => {
  it("reads status, defaulting to draft", () => {
    expect(readStatus(post)).toBe("draft");
    expect(readStatus("---\nstatus: published\n---\nx")).toBe("published");
    expect(readStatus("# no frontmatter")).toBe("draft");
    expect(readStatus("---\nstatus: weird\n---\n")).toBe("draft");
  });
  it("does not mistake a leading rule for frontmatter", () => {
    const doc = "---\nSome intro sentence.\n---\n\nBody";
    expect(findFrontmatter(doc)).toBeNull();
    expect(stripFrontmatter(doc)).toBe(doc);
  });
  it("strips a block", () => expect(stripFrontmatter(post)).toBe("\n# Title\n"));
  it("publishing sets status and adds the date once", () => {
    const once = setStatus(post, "published", "2026-10-26");
    expect(once).toEqual({ ok: true, text: "---\nstatus: published\npublished: 2026-10-26\ntags: [a]\n---\n\n# Title\n" });
    const back = setStatus((once as { text: string }).text, "draft", "2026-11-01");
    const again = setStatus((back as { text: string }).text, "published", "2026-11-02");
    expect((again as { text: string }).text).toContain("published: 2026-10-26");
    expect((again as { text: string }).text).not.toContain("2026-11-02");
  });
  it("keeps other keys, comments, order and CRLF", () => {
    const crlf = "---\r\n# note\r\ntitle: X\r\nstatus: draft\r\n---\r\nbody";
    expect(setStatus(crlf, "draft", "2026-10-26")).toEqual({ ok: true, text: crlf });
    expect((setStatus(crlf, "published", "2026-10-26") as { text: string }).text).toBe(
      "---\r\n# note\r\ntitle: X\r\nstatus: published\r\npublished: 2026-10-26\r\n---\r\nbody",
    );
  });
  it("adds a block when there is none", () => {
    expect(setStatus("# T\n", "published", "2026-10-26")).toEqual({
      ok: true,
      text: "---\nstatus: published\npublished: 2026-10-26\n---\n\n# T\n",
    });
  });
  it("inserts status first when the block lacks it", () => {
    expect(setStatus("---\ntitle: X\n---\nb", "draft", "2026-10-26")).toEqual({
      ok: true,
      text: "---\nstatus: draft\ntitle: X\n---\nb",
    });
  });
  it("refuses unparseable frontmatter", () => {
    expect(findFrontmatter("---\nstatus: draft\ntitle: x\n")).toBe("unparseable");
    expect(setStatus("---\nstatus: draft\ntitle: x\n", "published", "2026-10-26")).toEqual({ ok: false });
  });
  it("formats local dates", () => expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05"));
});

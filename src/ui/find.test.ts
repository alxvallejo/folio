import { describe, expect, it } from "vitest";
import { findRanges } from "./find";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("findRanges", () => {
  it("finds case-insensitive matches across text nodes", () => {
    const ranges = findRanges(root("<p>Folio reads <b>folio</b> files. FOLIO!</p>"), "folio");
    expect(ranges.map((r) => r.toString())).toEqual(["Folio", "folio", "FOLIO"]);
  });

  it("returns no matches for an empty query", () => {
    expect(findRanges(root("<p>text</p>"), "")).toEqual([]);
  });

  it("finds non-overlapping repeats", () => {
    expect(findRanges(root("<p>aaaa</p>"), "aa")).toHaveLength(2);
  });

  it("does not match across element boundaries (documented v1 limitation)", () => {
    expect(findRanges(root("<p>fo<em>lio</em></p>"), "folio")).toEqual([]);
  });
});

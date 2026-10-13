import { describe, expect, it } from "vitest";
import { findRanges, shouldReveal } from "./find";

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

describe("shouldReveal", () => {
  it("reveals a fresh user action once results are ready", () => {
    expect(shouldReveal({ token: 1, consumed: 0, resultsReady: true, current: 0 })).toBe(true);
  });

  it("does not reveal for a live reload (token already consumed)", () => {
    expect(shouldReveal({ token: 1, consumed: 1, resultsReady: true, current: 0 })).toBe(false);
  });

  it("does not reveal before results match the typed query or when nothing matches", () => {
    expect(shouldReveal({ token: 1, consumed: 0, resultsReady: false, current: 0 })).toBe(false);
    expect(shouldReveal({ token: 1, consumed: 0, resultsReady: true, current: -1 })).toBe(false);
  });

  it("reveals again for Enter on a single match (new token, same index)", () => {
    expect(shouldReveal({ token: 2, consumed: 1, resultsReady: true, current: 0 })).toBe(true);
  });
});

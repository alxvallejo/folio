import { describe, expect, it } from "vitest";
import { activeHeadingIndex } from "./spy";

describe("activeHeadingIndex", () => {
  const tops = [0, 500, 1000];

  it("returns -1 when there are no headings", () => {
    expect(activeHeadingIndex([], 0)).toBe(-1);
  });

  it("picks the last heading that has scrolled past the threshold", () => {
    expect(activeHeadingIndex(tops, 0)).toBe(0);
    expect(activeHeadingIndex(tops, 399)).toBe(0);
    expect(activeHeadingIndex(tops, 410)).toBe(1);
    expect(activeHeadingIndex(tops, 5000)).toBe(2);
  });

  it("treats the first heading as current before it reaches the top", () => {
    expect(activeHeadingIndex([300, 600], 0)).toBe(0);
  });

  it("selects the last heading at the bottom of the document", () => {
    expect(activeHeadingIndex(tops, 450, { atBottom: true })).toBe(2);
  });
});

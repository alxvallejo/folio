import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "./contrast";

describe("contrast", () => {
  it("computes relative luminance at the extremes", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("gives 21:1 for black on white and 1:1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#7a6f63", "#7a6f63")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1b2a6b", "#f6efe2")).toBeCloseTo(contrastRatio("#f6efe2", "#1b2a6b"), 10);
  });

  it("matches a known WCAG pair", () => {
    // #767676 on white is the classic 4.54:1 AA threshold color.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

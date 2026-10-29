import { describe, expect, it } from "vitest";
import { sentence } from "./text";

describe("sentence", () => {
  it("ends a message with exactly one period", () => {
    expect(sentence("Couldn't check for updates: offline")).toBe("Couldn't check for updates: offline.");
    expect(sentence("Couldn't make Folio the default: The file couldn’t be opened.")).toBe(
      "Couldn't make Folio the default: The file couldn’t be opened.",
    );
  });

  it("drops trailing whitespace and repeated periods", () => {
    expect(sentence("disk full..  \n")).toBe("disk full.");
  });
});

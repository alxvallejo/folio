import { describe, expect, it } from "vitest";
import { actionFor } from "./shortcuts";

const key = (code: string, mods: Partial<{ metaKey: boolean; shiftKey: boolean; altKey: boolean; ctrlKey: boolean }> = {}) => ({
  code,
  metaKey: true,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...mods,
});

describe("actionFor", () => {
  it.each([
    [key("KeyO"), "open-file"],
    [key("KeyO", { shiftKey: true }), "open-folder"],
    [key("KeyF"), "find"],
    [key("Backslash"), "toggle-sidebar"],
    [key("Backslash", { altKey: true }), "toggle-toc"],
    [key("KeyE"), "open-in-editor"],
    [key("Equal"), "font-bigger"],
    [key("Equal", { shiftKey: true }), "font-bigger"],
    [key("Minus"), "font-smaller"],
    [key("Digit0"), "font-reset"],
    [key("Comma"), "settings"],
  ])("maps %o to %s", (event, action) => {
    expect(actionFor(event)).toBe(action);
  });

  it("ignores keys without ⌘, with ctrl, or with unexpected modifiers", () => {
    expect(actionFor(key("KeyO", { metaKey: false }))).toBeNull();
    expect(actionFor(key("KeyO", { ctrlKey: true }))).toBeNull();
    expect(actionFor(key("KeyF", { shiftKey: true }))).toBeNull();
    expect(actionFor(key("KeyQ"))).toBeNull();
  });
});

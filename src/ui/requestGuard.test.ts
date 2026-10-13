import { describe, expect, it } from "vitest";
import { createRequestGuard } from "./requestGuard";

describe("createRequestGuard", () => {
  it("lets a user request stay current until another begins", () => {
    const guard = createRequestGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("does not supersede anything when a background reload takes a snapshot", () => {
    const guard = createRequestGuard();
    const open = guard.begin();
    const reload = guard.snapshot();
    expect(guard.isCurrent(open)).toBe(true);
    expect(guard.isCurrent(reload)).toBe(true);
  });

  it("supersedes a background reload when the user opens something meanwhile", () => {
    const guard = createRequestGuard();
    guard.begin();
    const reload = guard.snapshot();
    guard.begin();
    expect(guard.isCurrent(reload)).toBe(false);
  });
});

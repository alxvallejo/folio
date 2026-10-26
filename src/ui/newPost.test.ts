import { describe, expect, it, vi } from "vitest";
import { createAndOpenPost } from "./newPost";

const PATH = "/u/Blog/Slow software 2.md";

describe("createAndOpenPost", () => {
  it("creates and opens the post", async () => {
    const notify = vi.fn();
    const open = vi.fn(async () => true);
    expect(await createAndOpenPost("Slow software", { create: async () => PATH, open, notify })).toBe(true);
    expect(open).toHaveBeenCalledWith(PATH);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says so when the post was created but not opened", async () => {
    const notify = vi.fn();
    expect(await createAndOpenPost("Slow software", { create: async () => PATH, open: async () => false, notify })).toBe(true);
    expect(notify).toHaveBeenCalledWith("Created Slow software 2.md, but didn't open it.");
    notify.mockClear();
    const open = () => Promise.reject(new Error("boom"));
    expect(await createAndOpenPost("Slow software", { create: async () => PATH, open, notify })).toBe(true);
    expect(notify).toHaveBeenCalledWith("Created Slow software 2.md, but didn't open it.");
  });

  it("reports a failed create and opens nothing", async () => {
    const notify = vi.fn();
    const open = vi.fn(async () => true);
    const create = () => Promise.reject("A post can't be named that.");
    expect(await createAndOpenPost("x", { create, open, notify })).toBe(false);
    expect(notify).toHaveBeenCalledWith("A post can't be named that.");
    expect(open).not.toHaveBeenCalled();
  });
});

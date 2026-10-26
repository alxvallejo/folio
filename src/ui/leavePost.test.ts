import { describe, expect, it, vi } from "vitest";
import { leavePost } from "./leavePost";

const failing = { flush: () => Promise.reject(new Error("disk full")) };

describe("leavePost", () => {
  it("leaves once the post is saved, without asking", async () => {
    const confirm = vi.fn();
    const flush = vi.fn(async () => {});
    expect(await leavePost({ flush }, "/u/Blog/A post.md", confirm)).toBe(true);
    expect(flush).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("leaves when no post is open", async () => {
    expect(await leavePost(null, null, vi.fn())).toBe(true);
  });

  it("asks when the save failed, and stays unless told to leave", async () => {
    const confirm = vi.fn(async () => false);
    expect(await leavePost(failing, "/u/Blog/A post.md", confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("A post.md couldn't be saved. Leave it anyway? Your unsaved changes will be lost.");
    expect(await leavePost(failing, "/u/Blog/A post.md", async () => true)).toBe(true);
  });

  it("stays when the question itself fails", async () => {
    expect(await leavePost(failing, "/u/Blog/A post.md", () => Promise.reject(new Error("no dialog")))).toBe(false);
  });
});

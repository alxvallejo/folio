import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, decideDiskChange } from "./autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const ok = () => vi.fn(async (_path: string, _text: string) => {});

describe("autosave", () => {
  it("debounces", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("one");
    await vi.advanceTimersByTimeAsync(300);
    a.edit("two");
    await vi.advanceTimersByTimeAsync(300);
    a.edit("three");
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("/p/a.md", "three");
    expect(a.state()).toBe("saved");
  });

  it("flush_saves_now_to_its_own_path", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    const b = createAutosave({
      path: "/p/b.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("x");
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("/p/a.md", "x");
    await b.flush();
    expect(save).toHaveBeenCalledTimes(1);
    // the pending timer was cleared by flush, so nothing writes later
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("moves after writing pending text, and saves to the new path after", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/Untitled.md", save, initialText: "", onError: vi.fn() });
    a.edit("# Hello");
    const move = vi.fn(async (from: string) => {
      expect(save).toHaveBeenCalledWith(from, "# Hello");
      return "/p/Hello.md";
    });
    await expect(a.move(move)).resolves.toBe("/p/Hello.md");
    expect(move).toHaveBeenCalledWith("/p/Untitled.md");
    expect(a.path()).toBe("/p/Hello.md");
    a.edit("# Hello\n\nMore");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenLastCalledWith("/p/Hello.md", "# Hello\n\nMore");
    expect(a.state()).toBe("saved");
  });

  it("never writes to the old path once a move is queued", async () => {
    let finishMove: (path: string) => void = () => {};
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    const moved = a.move(() => new Promise<string>((r) => (finishMove = r)));
    await vi.advanceTimersByTimeAsync(0);
    a.edit("typed during the move");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    finishMove("/p/b.md");
    await moved;
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("/p/b.md", "typed during the move");
  });

  it("keeps the old path when the move fails", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    await expect(a.move(async () => Promise.reject(new Error("nope")))).rejects.toThrow("nope");
    expect(a.path()).toBe("/p/a.md");
    a.edit("x");
    await a.flush();
    expect(save).toHaveBeenCalledWith("/p/a.md", "x");
  });

  it("doesn't move when the pending write fails", async () => {
    const save = vi.fn(async () => Promise.reject(new Error("disk full")));
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    a.edit("x");
    const move = vi.fn(async () => "/p/b.md");
    await expect(a.move(move)).rejects.toThrow("disk full");
    expect(move).not.toHaveBeenCalled();
    expect(a.path()).toBe("/p/a.md");
  });

  it("serializes_writes", async () => {
    const resolvers: Array<() => void> = [];
    const save = vi.fn(
      (_p: string, _t: string) => new Promise<void>((r) => resolvers.push(r)),
    );
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("v1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.state()).toBe("saving");
    a.edit("v2");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    resolvers[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("/p/a.md", "v2");
    resolvers[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.state()).toBe("saved");
  });

  it("own_echo_is_ignored_after_more_typing", async () => {
    const a = createAutosave({
      path: "/p/a.md",
      save: ok(),
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("v1");
    await a.flush();
    a.edit("v2");
    expect(a.state()).toBe("unsaved");
    expect(decideDiskChange("v1", a, "v2")).toBe("ignore");
  });

  it("outside_change_reloads_when_clean_and_conflicts_when_dirty", async () => {
    const a = createAutosave({
      path: "/p/a.md",
      save: ok(),
      initialText: "",
      onError: vi.fn(),
    });
    expect(decideDiskChange("other", a, "mine0")).toBe("reload");
    a.edit("mine");
    expect(decideDiskChange("other", a, "mine")).toBe("conflict");
    expect(decideDiskChange("mine", a, "mine")).toBe("ignore");
    await a.flush();
    expect(decideDiskChange("other", a, "mine")).toBe("reload");
  });

  it("error_then_retry", async () => {
    const save = vi
      .fn<(p: string, t: string) => Promise<void>>()
      .mockRejectedValueOnce("No such file.")
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError,
    });
    a.edit("x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.state()).toBe("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Couldn't save a.md: No such file.");
    a.edit("xy");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.state()).toBe("saved");
  });

  it("reports one error per streak and adds the period when missing", async () => {
    const save = vi.fn().mockRejectedValue(new Error("denied"));
    const onError = vi.fn();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError,
    });
    a.edit("x");
    await vi.advanceTimersByTimeAsync(1000);
    a.edit("xy");
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Couldn't save a.md: denied.");
  });

  it("remembers only the last 5 writes as own", async () => {
    const a = createAutosave({
      path: "/p/a.md",
      save: ok(),
      initialText: "",
      onError: vi.fn(),
    });
    for (let i = 1; i <= 6; i++) {
      a.edit(`t${i}`);
      await a.flush();
    }
    expect(a.isOwnWrite("t1")).toBe(false);
    expect(a.isOwnWrite("t2")).toBe(true);
    expect(a.isOwnWrite("t6")).toBe(true);
  });

  it("markSaved cancels a pending save and marks clean", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("mine");
    a.markSaved("disk");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    expect(a.state()).toBe("saved");
  });

  it("dispose flushes pending text and then ignores edits", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    a.edit("last words");
    await a.dispose();
    expect(save).toHaveBeenCalledWith("/p/a.md", "last words");
    a.edit("late");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on state changes", async () => {
    const a = createAutosave({
      path: "/p/a.md",
      save: ok(),
      initialText: "",
      onError: vi.fn(),
    });
    const fn = vi.fn();
    const off = a.subscribe(fn);
    a.edit("x");
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    await a.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("saves an emptied document", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "old",
      onError: vi.fn(),
    });
    a.edit("");
    expect(a.state()).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledWith("/p/a.md", "");
  });

  it("keeps saving after a subscriber throws", async () => {
    const save = ok();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError: vi.fn(),
    });
    let boom = true;
    a.subscribe(() => {
      if (boom && a.state() === "saving") {
        boom = false;
        throw new Error("subscriber");
      }
    });
    a.edit("x");
    await vi.advanceTimersByTimeAsync(1000);
    a.edit("xy");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenLastCalledWith("/p/a.md", "xy");
    expect(a.state()).toBe("saved");
  });

  it("flush and dispose reject when the write fails", async () => {
    const save = vi
      .fn<(p: string, t: string) => Promise<void>>()
      .mockRejectedValueOnce("disk full")
      .mockRejectedValueOnce("disk full")
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const a = createAutosave({
      path: "/p/a.md",
      save,
      initialText: "",
      onError,
    });
    a.edit("x");
    await expect(a.flush()).rejects.toBe("disk full");
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(a.dispose()).rejects.toBe("disk full");
    expect(onError).toHaveBeenCalledTimes(1);
    const b = createAutosave({
      path: "/p/b.md",
      save,
      initialText: "",
      onError,
    });
    b.edit("y");
    await expect(b.flush()).resolves.toBeUndefined();
  });

  it("hold stops timed saves, keeps the text, and still lets flush write", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    a.edit("mine");
    a.hold("");
    a.edit("mine more");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(a.state()).toBe("unsaved");
    expect(a.isHeld()).toBe(true);
    await a.flush();
    expect(save).toHaveBeenCalledWith("/p/a.md", "mine more");
  });

  it("release resumes timed saves of the held text", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    a.hold("");
    a.edit("mine");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    a.release();
    expect(a.isHeld()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledWith("/p/a.md", "mine");
  });

  it("dispose writes held text", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "", onError: vi.fn() });
    a.edit("last words");
    a.hold("");
    await a.dispose();
    expect(save).toHaveBeenCalledWith("/p/a.md", "last words");
  });

  it("hold compares against the outside text, so returning to the old text is still unsaved", async () => {
    const save = ok();
    const a = createAutosave({ path: "/p/a.md", save, initialText: "old", onError: vi.fn() });
    a.edit("mine");
    a.hold("theirs");
    expect(a.state()).toBe("unsaved");
    a.edit("old"); // undo back to the last save
    expect(a.state()).toBe("unsaved");
    a.edit("theirs");
    expect(a.state()).toBe("saved");
    a.edit("old");
    await a.flush();
    expect(save).toHaveBeenCalledWith("/p/a.md", "old");
  });
});

describe("own-write detection forgets writes that are no longer on disk", () => {
  it("a revert to the opening text after a save is not ignored", async () => {
    const a = createAutosave({ path: "/p/a.md", save: ok(), initialText: "T0", onError: vi.fn() });
    a.edit("T0 more words");
    await a.flush();
    expect(decideDiskChange("T0", a, "T0 more words")).toBe("reload");
    a.edit("T0 more words!");
    expect(decideDiskChange("T0", a, "T0 more words!")).toBe("conflict");
  });

  it("a revert to an earlier save after a later save's echo is not ignored", async () => {
    const a = createAutosave({ path: "/p/a.md", save: ok(), initialText: "", onError: vi.fn() });
    a.edit("A");
    await a.flush();
    a.edit("B");
    await a.flush();
    expect(decideDiskChange("B", a, "B")).toBe("ignore");
    expect(decideDiskChange("A", a, "B")).toBe("reload");
  });

  it("still ignores lagging echoes of saves in flight or just finished", async () => {
    const resolvers: Array<() => void> = [];
    const save = vi.fn((_p: string, _t: string) => new Promise<void>((r) => resolvers.push(r)));
    const a = createAutosave({ path: "/p/a.md", save, initialText: "T0", onError: vi.fn() });
    a.edit("v1");
    await vi.advanceTimersByTimeAsync(1000);
    // A re-read before the first save lands still finds the opening text.
    expect(decideDiskChange("T0", a, "v1")).toBe("ignore");
    a.edit("v2");
    expect(decideDiskChange("v1", a, "v2")).toBe("ignore");
    resolvers[0]();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2); // v2 in flight
    a.edit("v3");
    expect(decideDiskChange("v1", a, "v3")).toBe("ignore");
    expect(decideDiskChange("v2", a, "v3")).toBe("ignore");
    resolvers[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(decideDiskChange("v2", a, "v3")).toBe("ignore");
    expect(decideDiskChange("v1", a, "v3")).toBe("conflict");
  });

  it("a repeated outside revert after Keep mine is not ignored", async () => {
    const a = createAutosave({ path: "/p/a.md", save: ok(), initialText: "", onError: vi.fn() });
    a.edit("A");
    await a.flush();
    a.edit("B");
    await a.flush();
    expect(decideDiskChange("B", a, "B")).toBe("ignore");
    a.edit("B more");
    expect(decideDiskChange("A", a, "B more")).toBe("conflict");
    a.hold("A");
    a.release(); // Keep mine
    await a.flush();
    expect(decideDiskChange("B more", a, "B more")).toBe("ignore");
    expect(decideDiskChange("A", a, "B more")).toBe("reload");
  });

  it("an outside write back to an own save after a reload is not ignored", async () => {
    const a = createAutosave({ path: "/p/a.md", save: ok(), initialText: "", onError: vi.fn() });
    a.edit("B");
    await a.flush();
    expect(decideDiskChange("C", a, "B")).toBe("reload");
    a.markSaved("C");
    expect(decideDiskChange("B", a, "C")).toBe("reload");
  });
});

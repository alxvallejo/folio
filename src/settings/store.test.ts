import { describe, expect, it, vi } from "vitest";
import { createSettingsStore, type ConfigIO } from "./store";

class FakeIO implements ConfigIO {
  text: string | null;
  writes: string[] = [];
  constructor(text: string | null) {
    this.text = text;
  }
  async read() {
    return this.text;
  }
  async write(text: string) {
    this.text = text;
    this.writes.push(text);
  }
  lastWrite() {
    return JSON.parse(this.writes[this.writes.length - 1]);
  }
}

describe("settings store", () => {
  it("loads defaults when the file is missing and writes nothing", async () => {
    const io = new FakeIO(null);
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    expect(store.getState()).toMatchObject({ loaded: true, invalid: null, settings: { lightTheme: "riso", fontSize: 18 } });
    expect(io.writes).toEqual([]);
  });

  it("creates the file on the first change with only overridden keys", async () => {
    const io = new FakeIO(null);
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    await store.update({ fontSize: 20 });
    expect(io.lastWrite()).toEqual({ fontSize: 20 });
    expect(store.getState().settings.fontSize).toBe(20);
  });

  it("preserves unknown keys on write", async () => {
    const io = new FakeIO('{"future": true, "fontSize": 16}');
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    await store.update({ lineHeight: 1.8 });
    expect(io.lastWrite()).toEqual({ future: true, fontSize: 16, lineHeight: 1.8 });
  });

  it("does not rewrite a file just because it held out-of-range values", async () => {
    const io = new FakeIO('{"fontSize": 40}');
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    expect(store.getState().settings.fontSize).toBe(24);
    expect(io.writes).toEqual([]);
  });

  it("keeps the last good config when the file turns invalid, and never overwrites it", async () => {
    const io = new FakeIO('{"fontSize": 20}');
    const notify = vi.fn();
    const store = createSettingsStore(io, notify);
    await store.load();

    io.text = "{ broken";
    await store.load();
    expect(store.getState().settings.fontSize).toBe(20);
    expect(store.getState().invalid).not.toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);

    await store.update({ fontSize: 21 });
    await store.update({ fontSize: 22 });
    expect(store.getState().settings.fontSize).toBe(22);
    expect(io.writes).toEqual([]);
    expect(io.text).toBe("{ broken");
    expect(notify).toHaveBeenCalledTimes(2); // one warning per invalid episode, not per change

    io.text = '{"fontSize": 16}';
    await store.load();
    expect(store.getState()).toMatchObject({ invalid: null, settings: { fontSize: 16 } });
  });

  it("ignores the echo of its own write", async () => {
    const io = new FakeIO(null);
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    await store.update({ lightTheme: "citrus" });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load(); // config-changed fired by our own write
    expect(listener).not.toHaveBeenCalled();
  });

  it("blocks writes after a failed read so it cannot clobber the real file", async () => {
    const io = new FakeIO('{"fontSize": 20, "future": true}');
    io.read = async () => {
      throw new Error("EIO");
    };
    const notify = vi.fn();
    const store = createSettingsStore(io, notify);
    await store.load();
    notify.mockClear();
    await store.update({ lastFolder: "/x" });
    await store.update({ fontSize: 22 });
    expect(io.writes).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.fontSize).toBe(22);
  });

  it("waits for the initial load before writing, preserving existing keys", async () => {
    const io = new FakeIO('{"future": true, "fontSize": 16}');
    const store = createSettingsStore(io, vi.fn());
    const loading = store.load();
    await store.update({ lineHeight: 1.8 });
    await loading;
    expect(io.lastWrite()).toEqual({ future: true, fontSize: 16, lineHeight: 1.8 });
  });

  it("loads on its own when update is called before load", async () => {
    const io = new FakeIO('{"future": true}');
    const store = createSettingsStore(io, vi.fn());
    await store.update({ fontSize: 20 });
    expect(io.lastWrite()).toEqual({ future: true, fontSize: 20 });
  });

  it("applies a hand edit that reverts to an earlier written value", async () => {
    const io = new FakeIO(null);
    const store = createSettingsStore(io, vi.fn());
    await store.load();
    await store.update({ fontSize: 20 }); // A
    const textA = io.text as string;
    io.text = '{"fontSize": 22}'; // hand edit B
    await store.load();
    expect(store.getState().settings.fontSize).toBe(22);
    io.text = textA; // hand revert to A
    await store.load();
    expect(store.getState().settings.fontSize).toBe(20);
  });

  it("keeps getState stable between changes and notifies subscribers", async () => {
    const store = createSettingsStore(new FakeIO(null), vi.fn());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load();
    const a = store.getState();
    expect(store.getState()).toBe(a);
    await store.update({ maxWidth: 72 });
    expect(store.getState()).not.toBe(a);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await store.update({ maxWidth: 73 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

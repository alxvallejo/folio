import { basename } from "../lib/paths";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

export interface Autosave {
  edit(text: string): void;
  flush(): Promise<void>;
  state(): SaveState;
  subscribe(fn: () => void): () => void;
  /**
   * True when diskText is one of the last few texts this instance wrote that can still be on disk.
   * A match forgets the writes before it: a re-read always returns the newest write.
   */
  isOwnWrite(diskText: string): boolean;
  /** The editor now shows text that is already on disk (after a reload); earlier writes are forgotten. */
  markSaved(text: string): void;
  /**
   * Someone else wrote `diskText`: stop timed saves (edits are kept, not written) until release(),
   * and compare against `diskText` from now on, so "saved" means the editor matches the disk.
   * flush() and dispose() still write.
   */
  hold(diskText: string): void;
  release(): void;
  isHeld(): boolean;
  dispose(): Promise<void>;
}

interface Options {
  path: string;
  /** What is on disk now; seeds the unsaved check so deleting everything still saves. */
  initialText: string;
  save: (path: string, text: string) => Promise<void>;
  delayMs?: number;
  onError: (message: string) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

// Watcher events can lag behind several writes, so remember a few.
const OWN_WRITES = 5;

function errorMessage(path: string, err: unknown): string {
  const detail = (err instanceof Error ? err.message : String(err)).trim();
  return `Couldn't save ${basename(path)}: ${detail}${detail.endsWith(".") ? "" : "."}`;
}

// One instance per open post. `path` is fixed at creation so pending text can
// only ever be written to the post it was typed in.
export function createAutosave(opts: Options): Autosave {
  const { path, save, onError } = opts;
  const delayMs = opts.delayMs ?? 1000;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id));

  let latest = opts.initialText;
  let lastSaved = opts.initialText;
  let current: SaveState = "saved";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let errored = false;
  let disposed = false;
  let held = false;
  // Oldest first. Starts with the opening text, which only stays until the first save lands.
  let recent: string[] = [opts.initialText];
  let openingInRecent = true;
  let inFlight: string | null = null;
  const listeners = new Set<() => void>();

  function setState(next: SaveState) {
    if (next === current) return;
    current = next;
    listeners.forEach((fn) => fn());
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    cancelTimer();
    if (held) return;
    timer = setTimer(() => {
      timer = null;
      enqueue().catch(() => {}); // already reported through state and onError
    }, delayMs);
  }

  async function writeLatest() {
    const text = latest;
    if (text === lastSaved) {
      if (current !== "saving") setState("saved");
      return;
    }
    setState("saving");
    // Record before writing: the watcher can report the file before save resolves.
    recent = [...recent, text];
    if (recent.length > OWN_WRITES) {
      recent = recent.slice(-OWN_WRITES);
      openingInRecent = false;
    }
    inFlight = text;
    try {
      await save(path, text);
    } catch (err) {
      inFlight = null;
      const first = !errored;
      errored = true;
      try {
        if (first) onError(errorMessage(path, err));
      } finally {
        setState("error");
      }
      // flush() and dispose() callers need to know the write failed.
      throw err;
    }
    inFlight = null;
    // The opening text can't come back from a re-read now, only from someone else's write.
    if (openingInRecent) {
      recent = recent.slice(1);
      openingInRecent = false;
    }
    lastSaved = text;
    errored = false;
    setState(latest === text ? "saved" : "unsaved");
  }

  // Writes queue behind each other, so two saves are never in flight at once.
  // The stored chain swallows failures so one bad write never blocks the next;
  // the returned promise still rejects for callers that wait on it.
  function enqueue(): Promise<void> {
    const run = chain.then(writeLatest);
    chain = run.catch(() => {});
    return run;
  }

  return {
    edit(text) {
      if (disposed) return;
      latest = text;
      cancelTimer();
      // An edit while a save is in flight is still unsaved until the next write.
      setState(
        text === lastSaved && current !== "saving" ? "saved" : "unsaved",
      );
      schedule();
    },
    flush() {
      cancelTimer();
      return enqueue();
    },
    state: () => current,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isOwnWrite(diskText) {
      const i = recent.lastIndexOf(diskText);
      if (i < 0) return false;
      // Disk has reached this write, so the ones before it can only come back from someone else.
      if (i > 0) {
        recent = recent.slice(i);
        openingInRecent = false;
      }
      return true;
    },
    markSaved(text) {
      cancelTimer();
      // Disk holds `text`, newer than everything written before except a write still in flight.
      recent = inFlight === null ? [] : [inFlight];
      openingInRecent = false;
      latest = text;
      lastSaved = text;
      errored = false;
      setState("saved");
    },
    hold(diskText) {
      held = true;
      cancelTimer();
      lastSaved = diskText;
      // A save in flight sets lastSaved again when it lands; until then the state stays "saving".
      if (current !== "saving") setState(latest === diskText ? "saved" : "unsaved");
    },
    release() {
      held = false;
      if (latest !== lastSaved) schedule();
    },
    isHeld: () => held,
    async dispose() {
      cancelTimer();
      try {
        await enqueue();
      } finally {
        disposed = true;
        listeners.clear();
      }
    },
  };
}

export function decideDiskChange(
  diskText: string,
  a: Autosave,
  editorText: string,
): "ignore" | "reload" | "conflict" {
  if (a.isOwnWrite(diskText) || diskText === editorText) return "ignore";
  return a.state() === "saved" ? "reload" : "conflict";
}

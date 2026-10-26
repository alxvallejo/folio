import { basename } from "../lib/paths";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

export interface Autosave {
  edit(text: string): void;
  flush(): Promise<void>;
  state(): SaveState;
  subscribe(fn: () => void): () => void;
  /** True when diskText is one of the last few texts this instance wrote. */
  isOwnWrite(diskText: string): boolean;
  /** The editor now shows text that is already on disk (after a reload). */
  markSaved(text: string): void;
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
  let recent: string[] = [opts.initialText];
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

  async function writeLatest() {
    const text = latest;
    if (text === lastSaved) {
      if (current !== "saving") setState("saved");
      return;
    }
    setState("saving");
    // Record before writing: the watcher can report the file before save resolves.
    recent = [...recent, text].slice(-OWN_WRITES);
    try {
      await save(path, text);
    } catch (err) {
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
      timer = setTimer(() => {
        timer = null;
        enqueue().catch(() => {}); // already reported through state and onError
      }, delayMs);
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
    isOwnWrite: (diskText) => recent.includes(diskText),
    markSaved(text) {
      cancelTimer();
      latest = text;
      lastSaved = text;
      errored = false;
      setState("saved");
    },
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, events } from "../lib/api";
import { basename, dirname } from "../lib/paths";
import type { Render, RenderResult, ThemePair } from "../render";
import { createRequestGuard } from "./requestGuard";

export const LARGE_FILE_BYTES = 5 * 1024 * 1024;

interface Loaded {
  path: string;
  text: string;
  lossy: boolean;
  /** Changes when a different file opens, not on reload or rename; keys the writing view. */
  session: number;
}

export interface PendingLarge {
  path: string;
  size: number;
}

export interface DocumentHandle {
  path: string | null;
  rendered: RenderResult | null;
  /** The file's text as last read from disk; updated by live reload. */
  text: string | null;
  /** True when the file wasn't valid UTF-8, so `text` isn't exactly what's on disk. */
  lossy: boolean;
  isEmpty: boolean;
  removed: boolean;
  pendingLarge: PendingLarge | null;
  session: number;
  /** The open file was renamed on disk: follow it without reloading. Ignored if `from` isn't open. */
  rename: (from: string, to: string) => void;
  /** Resolves true once the file is loaded; false if it failed or awaits large-file confirmation. */
  open: (path: string) => Promise<boolean>;
  confirmLarge: () => Promise<boolean>;
  cancelLarge: () => void;
}

export function useDocument(render: Render | null, themes: ThemePair, notify: (message: string) => void): DocumentHandle {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pendingLarge, setPendingLarge] = useState<PendingLarge | null>(null);
  const pathRef = useRef<string | null>(null);
  const sessionRef = useRef(0);
  const guard = useRef(createRequestGuard()).current;

  /** `reload` = background refresh of the open file (never supersedes a user open). */
  const load = useCallback(
    async (path: string, confirmed: boolean, reload: boolean) => {
      const token = reload ? guard.snapshot() : guard.begin();
      const stale = () => !guard.isCurrent(token) || (reload && path !== pathRef.current);
      try {
        const { text, size, lossy } = await api.readFile(path);
        if (stale()) return false;
        const isCurrent = path === pathRef.current;
        if (size > LARGE_FILE_BYTES && !confirmed && !isCurrent) {
          setPendingLarge({ path, size });
          return false;
        }
        if (!isCurrent) {
          await api.watchFile(path).catch((e) => notify(`Live reload is off for ${basename(path)}: ${String(e)}`));
          if (stale()) return false;
        }
        pathRef.current = path;
        setPendingLarge(null);
        setRemoved(false);
        if (!isCurrent) sessionRef.current += 1;
        setLoaded({ path, text, lossy, session: sessionRef.current });
        return true;
      } catch (e) {
        if (!stale()) notify(`Couldn't open ${basename(path)}: ${String(e)}`);
        return false;
      }
    },
    [notify, guard],
  );

  useEffect(() => {
    const unlisteners = [
      events.onFileChanged((path) => {
        if (path === pathRef.current) void load(path, true, true);
      }),
      events.onFileRemoved((path) => {
        if (path === pathRef.current) setRemoved(true);
      }),
    ];
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
    };
  }, [load]);

  // Re-renders when the text changes (live reload) or the light/dark theme picks change.
  const rendered = useMemo(
    () => (loaded && render ? render(loaded.text, { baseDir: dirname(loaded.path), themes }) : null),
    [loaded, render, themes],
  );

  const open = useCallback((path: string) => load(path, false, false), [load]);
  const confirmLarge = useCallback(
    () => (pendingLarge ? load(pendingLarge.path, true, false) : Promise.resolve(false)),
    [load, pendingLarge],
  );
  const cancelLarge = useCallback(() => setPendingLarge(null), []);
  const rename = useCallback(
    (from: string, to: string) => {
      if (pathRef.current !== from || from === to) return;
      pathRef.current = to;
      setRemoved(false);
      setLoaded((prev) => (prev && prev.path === from ? { ...prev, path: to } : prev));
      api.watchFile(to).catch((e) => notify(`Live reload is off for ${basename(to)}: ${String(e)}`));
    },
    [notify],
  );

  return {
    path: loaded?.path ?? null,
    rendered,
    text: loaded?.text ?? null,
    lossy: loaded?.lossy ?? false,
    isEmpty: loaded !== null && loaded.text.trim() === "",
    removed,
    pendingLarge,
    session: loaded?.session ?? 0,
    rename,
    open,
    confirmLarge,
    cancelLarge,
  };
}

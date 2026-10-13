import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, events } from "../lib/api";
import { basename, dirname } from "../lib/paths";
import type { Render, RenderResult, ThemePair } from "../render";

export const LARGE_FILE_BYTES = 5 * 1024 * 1024;

interface Loaded {
  path: string;
  text: string;
}

export interface PendingLarge {
  path: string;
  size: number;
}

export interface DocumentHandle {
  path: string | null;
  rendered: RenderResult | null;
  isEmpty: boolean;
  removed: boolean;
  pendingLarge: PendingLarge | null;
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

  const load = useCallback(
    async (path: string, confirmed: boolean) => {
      try {
        const { text, size } = await api.readFile(path);
        const isCurrent = path === pathRef.current;
        if (size > LARGE_FILE_BYTES && !confirmed && !isCurrent) {
          setPendingLarge({ path, size });
          return false;
        }
        if (!isCurrent) {
          await api.watchFile(path).catch((e) => notify(`Live reload is off for ${basename(path)}: ${String(e)}`));
        }
        pathRef.current = path;
        setPendingLarge(null);
        setRemoved(false);
        setLoaded({ path, text });
        return true;
      } catch (e) {
        notify(`Couldn't open ${basename(path)}: ${String(e)}`);
        return false;
      }
    },
    [notify],
  );

  useEffect(() => {
    const unlisteners = [
      events.onFileChanged((path) => {
        if (path === pathRef.current) void load(path, true);
      }),
      events.onFileRemoved((path) => {
        if (path === pathRef.current) setRemoved(true);
      }),
    ];
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((stop) => stop());
    };
  }, [load]);

  // Re-renders when the text changes (live reload) or the preset's Shiki pair changes (theme switch).
  const rendered = useMemo(
    () => (loaded && render ? render(loaded.text, { baseDir: dirname(loaded.path), themes }) : null),
    [loaded, render, themes],
  );

  const open = useCallback((path: string) => load(path, false), [load]);
  const confirmLarge = useCallback(
    () => (pendingLarge ? load(pendingLarge.path, true) : Promise.resolve(false)),
    [load, pendingLarge],
  );
  const cancelLarge = useCallback(() => setPendingLarge(null), []);

  return {
    path: loaded?.path ?? null,
    rendered,
    isEmpty: loaded !== null && loaded.text.trim() === "",
    removed,
    pendingLarge,
    open,
    confirmLarge,
    cancelLarge,
  };
}

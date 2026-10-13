import { useCallback, useEffect, useRef, useState } from "react";
import { api, events, type Tree } from "../lib/api";
import { basename } from "../lib/paths";

export function useFolder(notify: (message: string) => void) {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<Tree | null>(null);
  const rootRef = useRef<string | null>(null);

  /** Resolves true when the folder could be listed. */
  const open = useCallback(
    async (path: string) => {
      rootRef.current = path;
      setRoot(path);
      setTree(null);
      try {
        const next = await api.listTree(path);
        if (rootRef.current !== path) return false;
        setTree(next);
        await api.watchFolder(path).catch((e) => notify(`Folder won't refresh automatically: ${String(e)}`));
        return true;
      } catch (e) {
        notify(`Couldn't read ${basename(path)}: ${String(e)}`);
        return false;
      }
    },
    [notify],
  );

  useEffect(() => {
    const unlisten = events.onTreeChanged((changedRoot) => {
      if (changedRoot !== rootRef.current) return;
      api.listTree(changedRoot).then(
        (next) => {
          if (rootRef.current === changedRoot) setTree(next);
        },
        () => {},
      );
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  return { root, tree, open };
}

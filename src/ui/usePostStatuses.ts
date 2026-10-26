import { useEffect, useState } from "react";
import { api, type Tree } from "../lib/api";
import { isPostPath, postFilesIn } from "../posts/posts";
import { readStatus, type PostStatus } from "../posts/frontmatter";

/**
 * Status of every post in `tree` (Markdown files under `postsFolder`), read from disk. Re-reads
 * whenever the tree changes, which the folder watcher triggers on Markdown writes.
 */
export function usePostStatuses(tree: Tree | null, postsFolder: string | null): Map<string, PostStatus> {
  const [statuses, setStatuses] = useState<Map<string, PostStatus>>(() => new Map());
  useEffect(() => {
    if (!tree || !postsFolder) {
      setStatuses((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let stale = false;
    void Promise.all(
      postFilesIn(tree)
        .filter((path) => isPostPath(path, postsFolder))
        .map((path) =>
        api.readFile(path).then(
          (file) => [path, readStatus(file.text)] as const,
          () => null,
        ),
      ),
    ).then((entries) => {
      if (stale) return;
      setStatuses(new Map(entries.filter((e): e is readonly [string, PostStatus] => e !== null)));
    });
    return () => {
      stale = true;
    };
  }, [tree, postsFolder]);
  return statuses;
}

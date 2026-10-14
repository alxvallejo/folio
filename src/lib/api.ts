import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileContents {
  text: string;
  size: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export interface Tree {
  root: TreeNode;
  truncated: boolean;
}

export const api = {
  readFile: (path: string) => invoke<FileContents>("read_file", { path }),
  listTree: (root: string) => invoke<Tree>("list_tree", { root }),
  watchFile: (path: string) => invoke<void>("watch_file", { path }),
  watchFolder: (root: string) => invoke<void>("watch_folder", { root }),
  readConfig: () => invoke<string | null>("read_config"),
  writeConfig: (text: string) => invoke<void>("write_config", { text }),
  watchConfig: () => invoke<void>("watch_config"),
  frontendReady: () => invoke<string[]>("frontend_ready"),
  openInEditor: (path: string, command: string) => invoke<void>("open_in_editor", { path, command }),
  /** Starts the installed version on `path` and quits Folio. */
  relaunch: (path: string | null) => invoke<void>("relaunch", { path }),
};

const on =
  <T>(name: string) =>
  (handler: (payload: T) => void): Promise<UnlistenFn> =>
    listen<T>(name, (event) => handler(event.payload));

export const events = {
  /** Payload: the path passed to watchFile. */
  onFileChanged: on<string>("file-changed"),
  onFileRemoved: on<string>("file-removed"),
  /** Payload: the root passed to watchFolder. */
  onTreeChanged: on<string>("tree-changed"),
  onConfigChanged: on<null>("config-changed"),
  /** Payload: absolute path the OS asked Folio to open. */
  onOpenPath: on<string>("open-path"),
  /** Folio → Check for Updates… */
  onMenuCheckForUpdates: on<null>("menu-check-for-updates"),
};

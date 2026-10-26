import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileContents {
  text: string;
  size: number;
  /** True when the file wasn't valid UTF-8, so saving would change bytes. */
  lossy: boolean;
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

export interface DefaultApp {
  /** The app that opens Markdown files, e.g. "Warp"; null when there is none. */
  name: string | null;
  isFolio: boolean;
  /** False when Folio runs from the DMG, a translocated copy or a dev build. */
  canSet: boolean;
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
  /** The configured posts folder (absolute), or null when unset or unusable. */
  postsFolder: () => invoke<string | null>("posts_folder"),
  /** Opens a folder picker; null if cancelled, rejects with a message if the folder is too broad. */
  choosePostsFolder: () => invoke<string | null>("choose_posts_folder"),
  clearPostsFolder: () => invoke<void>("clear_posts_folder"),
  /** Rust refuses anything outside the posts folder or not already on disk. */
  writePost: (path: string, text: string) => invoke<void>("write_post", { path, text }),
  /** Creates a draft in the posts folder; resolves with its path. */
  createPost: (title: string) => invoke<string>("create_post", { title }),
  defaultMarkdownApp: () => invoke<DefaultApp>("default_markdown_app"),
  /** Shows the macOS confirmation dialog; resolves when the user answers. */
  makeDefaultMarkdownApp: () => invoke<"made" | "declined">("make_default_markdown_app"),
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

// Stands in for the Rust backend so the real frontend can run in a plain browser for screenshots.
// Query params: light, dark (theme ids), appearance (light | dark), writing (open the sample post).
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import sample from "./sample/two-ink-printing.md?raw";
import post from "./sample/Posts/Slow software.md?raw";

const HOME = "/Users/reader";
const ROOT = `${HOME}/Notes`;
const DOC = `${ROOT}/Printing/Two-ink printing.md`;
const POSTS = `${ROOT}/Posts`;
const POST = `${POSTS}/Slow software.md`;

const params = new URLSearchParams(location.search);
const config = {
  lightTheme: params.get("light") ?? "riso",
  darkTheme: params.get("dark") ?? "klein",
  appearance: params.get("appearance") ?? "light",
  lastFolder: "~/Notes",
};

const file = (dir: string, name: string) => ({ name, path: `${dir}/${name}`, isDir: false, children: [] });
const dir = (name: string, children: ReturnType<typeof file>[]) => ({ name, path: `${ROOT}/${name}`, isDir: true, children });
const writing = params.has("writing");
const tree = {
  truncated: false,
  root: {
    name: "Notes",
    path: ROOT,
    isDir: true,
    children: [
      dir("Journal", []),
      ...(writing ? [dir("Posts", [file(POSTS, "Slow software.md")])] : []),
      dir("Printing", [file(`${ROOT}/Printing`, "Paper stock.md"), file(`${ROOT}/Printing`, "Two-ink printing.md")]),
      file(ROOT, "Reading list.md"),
      file(ROOT, "README.md"),
    ],
  },
};

mockWindows("main");
mockIPC(
  (cmd, args) => {
    const a = args as Record<string, string>;
    switch (cmd) {
      case "read_config":
        return JSON.stringify(config);
      case "read_file":
        if (a.path === POST) return { text: post, size: post.length, lossy: false };
        if (a.path !== DOC) throw new Error("not found");
        return { text: sample, size: sample.length, lossy: false };
      case "list_tree":
        return tree;
      case "frontend_ready":
        return [writing ? POST : DOC];
      case "posts_folder":
        return writing ? POSTS : null;
      case "write_post":
        return null;
      case "create_post":
        return `${POSTS}/${a.title}.md`;
      case "plugin:path|resolve_directory":
        return HOME;
      case "default_markdown_app":
        return { name: "Folio", isFolio: true, canSet: true };
      case "plugin:updater|check":
        return null;
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

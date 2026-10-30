// Stands in for the Rust backend so the real frontend can run in a plain browser for screenshots.
// Query params: light, dark (theme ids), appearance (light | dark), writing (open the sample post),
// report (open a sample daily report in ~/Documents/Folio), guide (open the daily report guide, with no report command set).
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import sample from "./sample/two-ink-printing.md?raw";
import post from "./sample/Posts/Slow software.md?raw";
import report from "./sample/Reports/2026-10-29.md?raw";
import guide from "../../guides/daily-report.md?raw";

const HOME = "/Users/reader";
const ROOT = `${HOME}/Notes`;
const DOC = `${ROOT}/Printing/Two-ink printing.md`;
const POSTS = `${ROOT}/Posts`;
const POST = `${POSTS}/Slow software.md`;
const FOLIO = `${HOME}/Documents/Folio`;
const REPORTS = `${FOLIO}/Reports`;
const REPORT = `${REPORTS}/2026-10-29.md`;
const GUIDE = "/Applications/Folio.app/Contents/Resources/guides/daily-report.md";

const params = new URLSearchParams(location.search);
const writing = params.has("writing");
const reporting = params.has("report");
const guiding = params.has("guide");
const config = {
  lightTheme: params.get("light") ?? "riso",
  darkTheme: params.get("dark") ?? "klein",
  appearance: params.get("appearance") ?? "light",
  lastFolder: reporting ? "~/Documents/Folio" : "~/Notes",
  ...(reporting && {
    reportCommand: "~/daily-report/daily-report",
    recentFiles: ["~/Documents/Folio/Reports/2026-10-29.md", "~/Documents/Folio/Posts/Slow software.md", "~/Notes/Printing/Two-ink printing.md"],
  }),
};

const file = (dir: string, name: string) => ({ name, path: `${dir}/${name}`, isDir: false, children: [] });
const dir = (name: string, children: ReturnType<typeof file>[]) => ({ name, path: `${ROOT}/${name}`, isDir: true, children });
const notesTree = {
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

const folioTree = {
  truncated: false,
  root: {
    name: "Folio",
    path: FOLIO,
    isDir: true,
    children: [
      { name: "Posts", path: `${FOLIO}/Posts`, isDir: true, children: [file(`${FOLIO}/Posts`, "Slow software.md")] },
      { name: "Reports", path: REPORTS, isDir: true, children: ["2026-10-27.md", "2026-10-28.md", "2026-10-29.md"].map((name) => file(REPORTS, name)) },
    ],
  },
};
const opened = reporting ? REPORT : guiding ? GUIDE : writing ? POST : DOC;

mockWindows("main");
mockIPC(
  (cmd, args) => {
    const a = args as Record<string, string>;
    switch (cmd) {
      case "read_config":
        return JSON.stringify(config);
      case "read_file":
        if (a.path === POST) return { text: post, size: post.length, lossy: false };
        if (a.path === REPORT) return { text: report, size: report.length, lossy: false };
        if (a.path === GUIDE) return { text: guide, size: guide.length, lossy: false };
        if (a.path !== DOC) throw new Error("not found");
        return { text: sample, size: sample.length, lossy: false };
      case "list_tree":
        return reporting ? folioTree : notesTree;
      case "frontend_ready":
        return [opened];
      case "report_guide":
        return GUIDE;
      case "posts_folder":
        return writing ? POSTS : null;
      case "write_post":
        return null;
      case "create_post":
        return `${POSTS}/${a.title}.md`;
      case "plugin:path|resolve_directory":
        return HOME;
      case "is_installed":
        return true;
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

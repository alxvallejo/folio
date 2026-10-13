import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, events } from "../lib/api";
import { abbreviateHome, basename, expandHome } from "../lib/paths";
import { createSettingsStore } from "../settings/store";
import { applyTheme, resolveAppearance } from "../themes/apply";
import { PRESETS } from "../themes/presets";
import { DocumentView, LargeFilePrompt } from "./DocumentView";
import { EmptyState } from "./EmptyState";
import { FindBar } from "./FindBar";
import { scrollToFragment } from "./scroll";
import { actionFor, type Action } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { Toasts, useToasts } from "./Toasts";
import { MIN_TOC_HEADINGS, Toc } from "./Toc";
import { useDocument } from "./useDocument";
import { useFolder } from "./useFolder";
import { useRenderer } from "./useRenderer";
import { useSystemDark } from "./useSystemDark";

export function App() {
  const { toasts, notify, dismiss } = useToasts();

  // Settings and theme
  const store = useMemo(() => createSettingsStore({ read: api.readConfig, write: api.writeConfig }, notify), [notify]);
  const { settings, loaded } = useSyncExternalStore(store.subscribe, store.getState);
  const appearance = resolveAppearance(settings.appearance, useSystemDark());
  useLayoutEffect(() => applyTheme(document.documentElement, settings, appearance), [settings, appearance]);

  useEffect(() => {
    void store.load();
    api.watchConfig().catch((e) => notify(`Couldn't watch config.json: ${String(e)}`));
    const unlisten = events.onConfigChanged(() => void store.load());
    return () => void unlisten.then((stop) => stop());
  }, [store, notify]);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir().then(setHome, () => setHome(""));
  }, []);

  // Document and folder
  const render = useRenderer(notify);
  const doc = useDocument(render, PRESETS[settings.theme].shiki, notify);
  const folder = useFolder(notify);
  const { open: openDocument } = doc;
  const { open: openTree } = folder;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fragment, setFragment] = useState<string | null>(null);
  const clearFragment = useCallback(() => setFragment(null), []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tocOpen, setTocOpen] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const closeFind = useCallback(() => setFindOpen(false), []);

  const openFile = useCallback(
    async (path: string, target: string | null = null) => {
      if (await openDocument(path)) setFragment(target);
    },
    [openDocument],
  );

  const openFolder = useCallback(
    async (root: string) => {
      if (await openTree(root)) {
        setSidebarOpen(true);
        void store.update({ lastFolder: home ? abbreviateHome(root, home) : root });
      }
    },
    [openTree, store, home],
  );

  // Restore the last folder once settings and the home dir are known.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !loaded || home === null) return;
    restored.current = true;
    if (settings.lastFolder) void openTree(expandHome(settings.lastFolder, home));
  }, [loaded, home, settings.lastFolder, openTree]);

  const chooseFile = useCallback(async () => {
    const path = await openDialog({ multiple: false, directory: false, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof path === "string") void openFile(path);
  }, [openFile]);

  const chooseFolder = useCallback(async () => {
    const path = await openDialog({ multiple: false, directory: true });
    if (typeof path === "string") void openFolder(path);
  }, [openFolder]);

  // Paths the OS asks us to open (Finder, Dock, CLI args). Listen first, then report ready,
  // so a path delivered during cold start is never lost.
  const onOpenPath = useEffectEvent((path: string) => {
    void openFile(path);
  });
  useEffect(() => {
    const unlisten = events.onOpenPath((path) => onOpenPath(path));
    void unlisten
      .then(() => api.frontendReady())
      .then((paths) => {
        const last = paths[paths.length - 1];
        if (last) onOpenPath(last);
      })
      .catch((e) => notify(`Couldn't receive files from Finder: ${String(e)}`));
    return () => void unlisten.then((stop) => stop());
  }, [notify]);

  useEffect(() => {
    void getCurrentWindow().setTitle(doc.path ? basename(doc.path) : "Folio");
  }, [doc.path]);

  const handleLink = useCallback(
    (anchor: HTMLAnchorElement) => {
      const { folioAnchor, folioMd, folioFragment, folioFile, folioExternal } = anchor.dataset;
      if (folioAnchor !== undefined) {
        if (scrollRef.current) scrollToFragment(scrollRef.current, folioAnchor, true);
      } else if (folioMd) {
        void openFile(folioMd, folioFragment ?? null);
      } else if (folioFile) {
        // Reveal only: a link in an untrusted document must never launch a file.
        revealItemInDir(folioFile).catch((e) => notify(`Couldn't reveal ${basename(folioFile)}: ${String(e)}`));
      } else if (folioExternal !== undefined) {
        openUrl(anchor.getAttribute("href") ?? "").catch((e) => notify(`Couldn't open link: ${String(e)}`));
      }
    },
    [openFile, notify],
  );

  // Keyboard
  const onShortcut = useEffectEvent((action: Action): boolean => {
    switch (action) {
      case "open-file":
        void chooseFile();
        return true;
      case "open-folder":
        void chooseFolder();
        return true;
      case "toggle-sidebar":
        setSidebarOpen((open) => !open);
        return true;
      case "find":
        if (!doc.rendered || doc.isEmpty) return false;
        setFindOpen(true);
        setFindFocus((n) => n + 1);
        return true;
      case "toggle-toc":
        setTocOpen((open) => !open);
        return true;
      default:
        return false;
    }
  });
  const onEscape = useEffectEvent((): boolean => {
    if (findOpen) {
      setFindOpen(false);
      return true;
    }
    return false;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        if (onEscape()) event.preventDefault();
        return;
      }
      const action = actionFor(event);
      if (action && onShortcut(action)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  let body: ReactNode = null;
  if (doc.pendingLarge) {
    body = <LargeFilePrompt {...doc.pendingLarge} onConfirm={() => void doc.confirmLarge()} onCancel={doc.cancelLarge} />;
  } else if (doc.path && doc.rendered) {
    body = (
      <DocumentView
        path={doc.path}
        html={doc.rendered.html}
        isEmpty={doc.isEmpty}
        removed={doc.removed}
        scrollRef={scrollRef}
        fragment={fragment}
        onFragmentHandled={clearFragment}
        onLinkClick={handleLink}
      />
    );
  } else if (!doc.path) {
    body = (
      <EmptyState
        message={folder.root ? "Pick a file from the sidebar." : "Open a Markdown file or a folder to start reading."}
        onOpenFile={() => void chooseFile()}
        onOpenFolder={() => void chooseFolder()}
      />
    );
  }

  const headings = doc.rendered && !doc.isEmpty ? doc.rendered.headings : [];
  const showToc = tocOpen && !doc.pendingLarge && headings.length >= MIN_TOC_HEADINGS;

  return (
    <div className="app">
      {sidebarOpen && folder.root && (
        <Sidebar key={folder.root} root={folder.root} tree={folder.tree} currentPath={doc.path} onOpen={(path) => void openFile(path)} />
      )}
      <main className="main">
        {findOpen && doc.rendered && <FindBar scrollRef={scrollRef} html={doc.rendered.html} focusSignal={findFocus} onClose={closeFind} />}
        <div className="doc-scroll" ref={scrollRef}>
          {body}
        </div>
      </main>
      {showToc && doc.rendered && <Toc headings={headings} html={doc.rendered.html} scrollRef={scrollRef} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

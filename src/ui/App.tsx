import { getVersion } from "@tauri-apps/api/app";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ASK_DELAY_MS, askOnFirstLaunch } from "../defaultApp/defaultApp";
import { api, events, type DefaultApp } from "../lib/api";
import { abbreviateHome, basename, expandHome } from "../lib/paths";
import type { SaveState } from "../editor/autosave";
import { isPostPath, writingModeFor } from "../posts/posts";
import type { Heading } from "../render";
import { DEFAULT_FONT_SIZE } from "../settings/schema";
import { shikiThemeName } from "../render/shikiThemes";
import { createSettingsStore } from "../settings/store";
import { activeTheme, applyTheme, resolveAppearance } from "../themes/apply";
import { themesFor } from "../themes/catalog";
import { createUpdater, releaseNotesUrl } from "../update/updater";
import { DocumentView, LargeFilePrompt } from "./DocumentView";
import { EmptyState } from "./EmptyState";
import { FindBar } from "./FindBar";
import { leavePost } from "./leavePost";
import { NewPostBox } from "./NewPostBox";
import { scrollToFragment } from "./scroll";
import { SettingsPanel } from "./SettingsPanel";
import { actionFor, type Action } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { MIN_TOC_HEADINGS, Toc } from "./Toc";
import { Toasts, useToasts } from "./Toasts";
import { Toolbar } from "./Toolbar";
import { UpdateBanner } from "./UpdateBanner";
import { useDocument } from "./useDocument";
import { useFolder } from "./useFolder";
import { usePostStatuses } from "./usePostStatuses";
import { useRenderer } from "./useRenderer";
import { useSystemDark } from "./useSystemDark";
import { WriteView, type WriterHandle } from "./WriteView";

export function App() {
  const { toasts, notify, dismiss } = useToasts();

  // Settings and theme
  const store = useMemo(() => createSettingsStore({ read: api.readConfig, write: api.writeConfig }, notify), [notify]);
  const { settings, invalid, loaded } = useSyncExternalStore(store.subscribe, store.getState);
  const appearance = resolveAppearance(settings.appearance, useSystemDark());
  useLayoutEffect(() => applyTheme(document.documentElement, settings, appearance), [settings, appearance]);
  const updateSettings = useCallback((patch: Parameters<typeof store.update>[0]) => void store.update(patch), [store]);

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
  // Memoized: a fresh object every render would re-render the whole document.
  const shikiThemes = useMemo(
    () => ({ light: shikiThemeName(settings.lightTheme, "light"), dark: shikiThemeName(settings.darkTheme, "dark") }),
    [settings.lightTheme, settings.darkTheme],
  );
  const doc = useDocument(render, shikiThemes, notify);
  const shownTheme = activeTheme(settings, appearance);
  const folder = useFolder(notify);
  const { open: openDocument } = doc;
  const { open: openTree } = folder;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fragment, setFragment] = useState<string | null>(null);
  const clearFragment = useCallback(() => setFragment(null), []);

  // Posts folder: the canonical path from Rust, re-read whenever config.json changes.
  const [postsFolder, setPostsFolder] = useState<string | null>(null);
  const refreshPostsFolder = useCallback(() => {
    api.postsFolder().then(setPostsFolder, () => setPostsFolder(null));
  }, []);
  useEffect(() => {
    refreshPostsFolder();
    const unlisten = events.onConfigChanged(refreshPostsFolder);
    return () => void unlisten.then((stop) => stop());
  }, [refreshPostsFolder]);
  const statuses = usePostStatuses(folder.tree, postsFolder);

  // Writing mode: posts in the posts folder open in the editor, unless they aren't valid UTF-8.
  const writing = doc.path !== null && writingModeFor(doc.path, postsFolder, doc.lossy);
  const writerRef = useRef<WriterHandle | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [writingHeadings, setWritingHeadings] = useState<Heading[]>([]);
  const [activeHeading, setActiveHeading] = useState(0);
  const jumpToHeading = useCallback((id: string) => writerRef.current?.jumpTo(id), []);
  const lossyPost = doc.path !== null && doc.lossy && isPostPath(doc.path, postsFolder);
  const lossyNoticeFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lossyPost || !doc.path) {
      lossyNoticeFor.current = null;
      return;
    }
    if (lossyNoticeFor.current === doc.path) return;
    lossyNoticeFor.current = doc.path;
    notify(`${basename(doc.path)} isn't valid UTF-8, so Folio opened it read-only.`);
  }, [lossyPost, doc.path, notify]);

  /**
   * Saves the open post before leaving it. Resolves false when the save failed and Alex chose to
   * stay; callers then keep the post open. Also used for quit, close and Install & Relaunch.
   */
  const leaveOpenPost = useCallback(
    () => leavePost(writerRef.current, doc.path, (message) => ask(message, { kind: "warning", okLabel: "Leave", cancelLabel: "Stay" })),
    [doc.path],
  );
  const inPostsFolder = postsFolder !== null && folder.root !== null && (folder.root === postsFolder || isPostPath(`${folder.root}/x.md`, postsFolder));
  const [newPostOpen, setNewPostOpen] = useState(false);
  useEffect(() => {
    if (!inPostsFolder) setNewPostOpen(false);
  }, [inPostsFolder]);

  // Updates
  const updater = useMemo(
    () => createUpdater({ check: () => check({ timeout: 30_000 }), currentVersion: getVersion, relaunch: api.relaunch, notify }),
    [notify],
  );
  const updateState = useSyncExternalStore(updater.subscribe, updater.getState);
  // Once per launch, 30 s after settings load. Turning the setting off before then cancels it.
  useEffect(() => {
    if (!loaded || !settings.autoUpdateCheck) return;
    return updater.scheduleAutomaticCheck();
  }, [loaded, settings.autoUpdateCheck, updater]);
  useEffect(() => {
    const unlisten = events.onMenuCheckForUpdates(() => void updater.checkManually());
    return () => void unlisten.then((stop) => stop());
  }, [updater]);

  // Default Markdown app: the one-time ask, 2 s after settings load, and the Settings row.
  const askScheduled = useRef(false);
  useEffect(() => {
    if (askScheduled.current || !loaded) return;
    askScheduled.current = true;
    const asked = settings.defaultAppAsked;
    window.setTimeout(() => {
      void askOnFirstLaunch(asked, {
        status: api.defaultMarkdownApp,
        make: api.makeDefaultMarkdownApp,
        markAsked: () => store.update({ defaultAppAsked: true }),
      });
    }, ASK_DELAY_MS);
  }, [loaded, settings.defaultAppAsked, store]);

  // Panels
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tocOpen, setTocOpen] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeFind = useCallback(() => setFindOpen(false), []);
  const [defaultApp, setDefaultApp] = useState<DefaultApp | null>(null);
  const refreshDefaultApp = useCallback(() => {
    api.defaultMarkdownApp().then(setDefaultApp, () => setDefaultApp(null));
  }, []);
  useEffect(() => {
    if (settingsOpen) refreshDefaultApp();
  }, [settingsOpen, refreshDefaultApp]);
  const makeDefaultApp = useCallback(() => {
    api.makeDefaultMarkdownApp().then(refreshDefaultApp, (e) => notify(`Couldn't make Folio the default: ${String(e)}.`));
  }, [refreshDefaultApp, notify]);
  const hasDocument = writing || (doc.rendered !== null && !doc.isEmpty && !doc.pendingLarge);

  const openFile = useCallback(
    async (path: string, target: string | null = null) => {
      if (!(await leaveOpenPost())) return;
      if (await openDocument(path)) setFragment(target);
    },
    [openDocument, leaveOpenPost],
  );

  const openFolder = useCallback(
    async (root: string) => {
      const opened = await openTree(root);
      if (opened) {
        setSidebarOpen(true);
        void store.update({ lastFolder: home ? abbreviateHome(root, home) : root });
      }
      return opened;
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

  /** Asks for a posts folder if none is set, then opens it. Resolves true when it is open. */
  const ensurePostsFolder = useCallback(async () => {
    let folderPath = await api.postsFolder().catch(() => null);
    if (!folderPath) {
      try {
        folderPath = await api.choosePostsFolder();
      } catch (e) {
        notify(String(e));
        return false;
      }
      if (!folderPath) return false;
    }
    setPostsFolder(folderPath);
    return openFolder(folderPath);
  }, [notify, openFolder]);

  const openPosts = useCallback(async () => {
    await ensurePostsFolder();
  }, [ensurePostsFolder]);

  /** Creates a draft and opens it; resolves false (after a toast) when that failed. */
  const newPost = useCallback(
    async (title: string) => {
      try {
        await openFile(await api.createPost(title));
        return true;
      } catch (e) {
        notify(String(e));
        return false;
      }
    },
    [openFile, notify],
  );
  /** ⌘N: show the title box, opening the posts folder first when it isn't the open folder. */
  const startNewPost = useCallback(async () => {
    if (!inPostsFolder && !(await ensurePostsFolder())) return;
    setSidebarOpen(true);
    setNewPostOpen(true);
  }, [inPostsFolder, ensurePostsFolder]);

  const onMenuAction = useEffectEvent((id: string) => {
    if (id === "new-post") void startNewPost();
    else if (id === "open-posts") void openPosts();
  });
  useEffect(() => {
    const unlisten = events.onMenuAction((id) => onMenuAction(id));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // Save first: once the folder changes, Rust refuses writes to a post from the old one.
  const choosePostsFolder = useCallback(async () => {
    if (!(await leaveOpenPost())) return;
    api.choosePostsFolder().then(refreshPostsFolder, (e) => notify(String(e)));
  }, [leaveOpenPost, refreshPostsFolder, notify]);
  const clearPostsFolder = useCallback(async () => {
    if (!(await leaveOpenPost())) return;
    api.clearPostsFolder().then(refreshPostsFolder, (e) => notify(String(e)));
  }, [leaveOpenPost, refreshPostsFolder, notify]);

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

  /** ⌘F: CodeMirror's search while writing, the find bar while reading. */
  const openFind = useCallback(() => {
    if (writing) {
      writerRef.current?.openSearch();
      return;
    }
    setFindOpen(true);
    setFindFocus((n) => n + 1);
  }, [writing]);

  const openInEditor = useCallback(async () => {
    const path = doc.path;
    if (!path) return;
    const command = settings.editorCommand;
    // Save first so the editor opens what's on screen. A failed save has already been reported.
    await writerRef.current?.flush().catch(() => {});
    api.openInEditor(path, command).catch(() => notify(`Couldn't run \`${command}\` — set your editor in Settings`));
  }, [doc.path, settings.editorCommand, notify]);

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
      case "toggle-toc":
        setTocOpen((open) => !open);
        return true;
      case "find":
        if (!hasDocument) return false;
        openFind();
        return true;
      case "open-in-editor":
        void openInEditor();
        return true;
      case "font-bigger":
        updateSettings({ fontSize: settings.fontSize + 1 });
        return true;
      case "font-smaller":
        updateSettings({ fontSize: settings.fontSize - 1 });
        return true;
      case "font-reset":
        updateSettings({ fontSize: DEFAULT_FONT_SIZE });
        return true;
      case "settings":
        setSettingsOpen((open) => !open);
        return true;
    }
  });
  const onEscape = useEffectEvent((): boolean => {
    if (findOpen && !writing) {
      setFindOpen(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
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
  } else if (writing && doc.path && doc.text !== null) {
    body = (
      <WriteView
        key={doc.path}
        path={doc.path}
        diskText={doc.text}
        removed={doc.removed}
        onState={setSaveState}
        onHeadings={setWritingHeadings}
        onActiveHeading={setActiveHeading}
        handleRef={writerRef}
        notify={notify}
      />
    );
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

  const headings = writing ? writingHeadings : doc.rendered && !doc.isEmpty ? doc.rendered.headings : [];
  const showToc = tocOpen && !doc.pendingLarge && headings.length >= MIN_TOC_HEADINGS;

  return (
    <div className="app">
      {sidebarOpen && folder.root && (
        <Sidebar
          key={folder.root}
          root={folder.root}
          tree={folder.tree}
          currentPath={doc.path}
          onOpen={(path) => void openFile(path)}
          statuses={statuses}
          onNewPost={inPostsFolder ? () => setNewPostOpen(true) : undefined}
          newPostBox={newPostOpen && inPostsFolder ? <NewPostBox onCreate={newPost} onClose={() => setNewPostOpen(false)} /> : undefined}
        />
      )}
      <main className="main">
        <Toolbar
          title={doc.path ? basename(doc.path) : "Folio"}
          saveState={writing ? saveState : undefined}
          theme={shownTheme}
          themes={themesFor(appearance)}
          onTheme={(theme) => updateSettings(appearance === "light" ? { lightTheme: theme } : { darkTheme: theme })}
          canToggleSidebar={folder.root !== null}
          sidebarOpen={sidebarOpen && folder.root !== null}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          hasDocument={hasDocument}
          onFind={openFind}
          onOpenInEditor={() => void openInEditor()}
          tocOpen={tocOpen}
          onToggleToc={() => setTocOpen((open) => !open)}
          settingsOpen={settingsOpen}
          onSettings={() => setSettingsOpen((open) => !open)}
        />
        {findOpen && !writing && doc.rendered && <FindBar scrollRef={scrollRef} html={doc.rendered.html} focusSignal={findFocus} onClose={closeFind} />}
        <UpdateBanner
          state={updateState}
          onWhatsNew={(version) => openUrl(releaseNotesUrl(version)).catch((e) => notify(`Couldn't open link: ${String(e)}`))}
          onLater={updater.dismiss}
          onInstall={() => void updater.install(doc.path)}
        />
        <div className={writing ? "doc-scroll writing" : "doc-scroll"} ref={scrollRef}>
          {body}
        </div>
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            shownTheme={shownTheme}
            invalid={invalid}
            defaultApp={defaultApp}
            onMakeDefault={makeDefaultApp}
            onChoosePostsFolder={() => void choosePostsFolder()}
            onClearPostsFolder={() => void clearPostsFolder()}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </main>
      {showToc && writing && <Toc headings={headings} html="" scrollRef={scrollRef} onJump={jumpToHeading} activeIndex={activeHeading} />}
      {showToc && !writing && doc.rendered && <Toc headings={headings} html={doc.rendered.html} scrollRef={scrollRef} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

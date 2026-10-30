import { getVersion } from "@tauri-apps/api/app";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { writeHtml } from "@tauri-apps/plugin-clipboard-manager";
import { check } from "@tauri-apps/plugin-updater";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ASK_DELAY_MS, askOnFirstLaunch, singleFlight } from "../defaultApp/defaultApp";
import { api, events, type DefaultApp } from "../lib/api";
import { abbreviateHome, basename, expandHome } from "../lib/paths";
import { sentence } from "../lib/text";
import type { SaveState } from "../editor/autosave";
import { localDate, readStatus, setStatus, type PostStatus } from "../posts/frontmatter";
import { isPostPath, postsFolderShown, writingModeFor } from "../posts/posts";
import { copyMessage, toSubstack } from "../posts/substack";
import type { Heading } from "../render";
import { DEFAULT_FONT_SIZE } from "../settings/schema";
import { shikiThemeName } from "../render/shikiThemes";
import { createSettingsStore } from "../settings/store";
import { activeTheme, applyTheme, resolveAppearance } from "../themes/apply";
import { themesFor } from "../themes/catalog";
import { createReportRunner } from "../report/runner";
import { createUpdater, releaseNotesUrl } from "../update/updater";
import { DocumentView, LargeFilePrompt } from "./DocumentView";
import { EmptyState } from "./EmptyState";
import { FindBar } from "./FindBar";
import { leavePost } from "./leavePost";
import { ReportBanner } from "./ReportBanner";
import { createAndOpenPost } from "./newPost";
import { forgetRecent, pushRecent, renameRecent } from "./recent";
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
  const [postStatus, setPostStatus] = useState<PostStatus>("draft");
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
  // The tree's paths are canonical, like postsFolder, even when the folder was opened through a symlink.
  const treeRoot = folder.tree?.root.path ?? folder.root;
  const inPostsFolder = postsFolderShown(treeRoot, postsFolder);

  // Updates
  const updater = useMemo(
    () => createUpdater({ check: () => check({ timeout: 30_000 }), canInstall: api.isInstalled, currentVersion: getVersion, relaunch: api.relaunch, notify }),
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
  // One macOS dialog at a time: clicks while it is open are ignored, and the button shows as disabled.
  const [makingDefault, setMakingDefault] = useState(false);
  const makeDefaultApp = useMemo(
    () =>
      singleFlight(async () => {
        setMakingDefault(true);
        try {
          await api.makeDefaultMarkdownApp();
          refreshDefaultApp();
        } catch (e) {
          notify(sentence(`Couldn't make Folio the default: ${String(e)}`));
        } finally {
          setMakingDefault(false);
        }
      }),
    [refreshDefaultApp, notify],
  );
  const hasDocument = writing || (doc.rendered !== null && !doc.isEmpty && !doc.pendingLarge);

  /** Resolves true once `path` is open; false when Alex stayed on the open post or it failed. */
  const openFile = useCallback(
    async (path: string, target: string | null = null) => {
      if (!(await leaveOpenPost())) return false;
      if (!(await openDocument(path))) return false;
      setFragment(target);
      return true;
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

  // The bundled daily report guide. It's never added to Recent, and while no report command is set it
  // shows a banner pointing at Settings.
  const [guidePath, setGuidePath] = useState<string | null>(null);
  useEffect(() => {
    api.reportGuide().then(setGuidePath, () => setGuidePath(null));
  }, []);

  // Recent files, kept `~`-abbreviated in config.json like lastFolder. The ref holds the latest
  // list, so opens in quick succession each build on the one before rather than on stale settings.
  const recentRef = useRef(settings.recentFiles);
  useEffect(() => {
    recentRef.current = settings.recentFiles;
  }, [settings.recentFiles]);
  const tilde = useCallback((path: string) => (home ? abbreviateHome(path, home) : path), [home]);
  const recentPaths = useMemo(() => (home ? settings.recentFiles.map((p) => expandHome(p, home)) : settings.recentFiles), [settings.recentFiles, home]);
  const updateRecent = useCallback(
    (change: (list: string[]) => string[]) => {
      const next = change(recentRef.current);
      if (next === recentRef.current) return;
      recentRef.current = next;
      void store.update({ recentFiles: next });
    },
    [store],
  );
  // Wait for settings, or a file opened at launch would replace the saved list.
  useEffect(() => {
    if (loaded && home !== null && doc.path && doc.path !== guidePath) updateRecent((list) => pushRecent(list, tilde(doc.path!)));
  }, [loaded, home, doc.path, guidePath, tilde, updateRecent]);
  const { rename: followDocumentRename } = doc;
  const followRename = useCallback(
    (from: string, to: string) => {
      followDocumentRename(from, to);
      updateRecent((list) => renameRecent(list, tilde(from), tilde(to)));
    },
    [followDocumentRename, tilde, updateRecent],
  );
  const openRecent = useCallback(
    async (path: string) => {
      if (await openFile(path)) return;
      // Drop it only if the file is gone, not when Alex chose to stay on the open post.
      api.readFile(path).catch(() => updateRecent((list) => forgetRecent(list, tilde(path))));
    },
    [openFile, tilde, updateRecent],
  );

  // Restore the last folder once settings and the home dir are known.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !loaded || home === null) return;
    restored.current = true;
    if (settings.lastFolder) void openTree(expandHome(settings.lastFolder, home));
  }, [loaded, home, settings.lastFolder, openTree]);

  /** Opens the posts folder, setting up ~/Documents/Folio/Posts if none is set. Resolves true when it is open. */
  const ensurePostsFolder = useCallback(async () => {
    let folderPath = await api.postsFolder().catch(() => null);
    if (!folderPath) {
      try {
        folderPath = await api.useDefaultPostsFolder();
      } catch (e) {
        notify(`Couldn't set up a posts folder: ${String(e).replace(/\.$/, "")}.`);
        return false;
      }
      notify("Posts go in Documents › Folio › Posts. You can change this in Settings.");
    }
    setPostsFolder(folderPath);
    return openFolder(folderPath);
  }, [notify, openFolder]);

  const openPosts = useCallback(async () => {
    await ensurePostsFolder();
  }, [ensurePostsFolder]);

  /**
   * ⌘N and the sidebar button: opens the posts folder if it isn't open, then creates Untitled.md
   * and opens it with the cursor in its empty title. The file is renamed as the title is written.
   */
  const creatingPost = useRef(false);
  const startNewPost = useCallback(async () => {
    if (creatingPost.current) return;
    creatingPost.current = true;
    try {
      if (!inPostsFolder && !(await ensurePostsFolder())) return;
      setSidebarOpen(true);
      await createAndOpenPost("", { create: api.createPost, open: (path) => openFile(path), notify });
    } finally {
      creatingPost.current = false;
    }
  }, [inPostsFolder, ensurePostsFolder, openFile, notify]);

  /** Puts the open post on the clipboard as formatted text for pasting into Substack. */
  const copyForSubstack = useCallback(async () => {
    const writer = writerRef.current;
    if (!writer) return;
    const r = toSubstack(writer.text());
    try {
      await writeHtml(r.html, r.text);
      notify(copyMessage(r));
    } catch (e) {
      notify(`Couldn't copy: ${String(e).replace(/\.$/, "")}.`);
    }
  }, [notify]);
  /** Flips draft and published in the post's frontmatter as one undoable edit; autosave writes it. */
  const toggleStatus = useCallback(() => {
    const writer = writerRef.current;
    if (!writer) return;
    const text = writer.text();
    const next = readStatus(text) === "published" ? "draft" : "published";
    const result = setStatus(text, next, localDate(new Date()));
    if (!result.ok) notify("This post's frontmatter couldn't be read. Fix it by hand to change its status.");
    else writer.replace(result.text);
  }, [notify]);

  // File › Daily Report: runs the report command and opens the file it wrote, or the guide when none is set.
  const report = useMemo(() => createReportRunner({ run: api.runReport, cancel: api.cancelReport }), []);
  const reportState = useSyncExternalStore(report.subscribe, report.getState);
  const [reportFocus, setReportFocus] = useState(0);
  const openGuide = useCallback(async () => {
    try {
      await openFile(guidePath ?? (await api.reportGuide()));
    } catch (e) {
      notify(sentence(`Couldn't open the guide: ${String(e)}`));
    }
  }, [guidePath, openFile, notify]);
  const runReport = useCallback(async () => {
    const command = settings.reportCommand;
    if (!command) {
      await openGuide();
      return;
    }
    const path = await report.start(command);
    if (path) await openFile(path);
  }, [settings.reportCommand, report, openGuide, openFile]);
  const setUpReport = useCallback(() => {
    setSettingsOpen(true);
    setReportFocus((n) => n + 1);
  }, []);

  const onMenuAction = useEffectEvent((id: string) => {
    if (id === "copy-for-substack") {
      if (writing) void copyForSubstack();
      return;
    }
    if (id === "quit") {
      // Acknowledge first so Rust's 3 s fallback doesn't exit under a Leave/Stay dialog.
      void api.quitAcknowledged();
      void leaveOpenPost().then((left) => {
        if (left) void api.quit();
      });
      return;
    }
    if (id === "new-post") void startNewPost();
    else if (id === "open-posts") void openPosts();
    else if (id === "daily-report") void runReport();
    else if (id === "daily-report-guide") void openGuide();
  });
  useEffect(() => {
    const unlisten = events.onMenuAction((id) => onMenuAction(id));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // Closing the window saves the open post first; Stay on a failed save keeps the window open.
  const onCloseRequested = useEffectEvent(async () => {
    if (await leaveOpenPost()) await getCurrentWindow().destroy();
  });
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void onCloseRequested();
    });
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
    // The flush may have renamed the post to follow its title.
    api.openInEditor(writerRef.current?.path() ?? path, command).catch(() => notify(`Couldn't run \`${command}\` — set your editor in Settings`));
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
        key={doc.session}
        path={doc.path}
        diskText={doc.text}
        removed={doc.removed}
        onState={setSaveState}
        onHeadings={setWritingHeadings}
        onStatus={setPostStatus}
        onActiveHeading={setActiveHeading}
        onRenamed={followRename}
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
          onNewPost={() => void startNewPost()}
          recent={recentPaths}
          recentOpen={settings.recentOpen}
          onToggleRecent={() => updateSettings({ recentOpen: !settings.recentOpen })}
          onOpenRecent={(path) => void openRecent(path)}
        />
      )}
      <main className="main">
        <Toolbar
          title={doc.path ? basename(doc.path) : "Folio"}
          saveState={writing ? saveState : undefined}
          post={writing ? { status: postStatus, onCopy: () => void copyForSubstack(), onToggleStatus: toggleStatus } : undefined}
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
          onInstall={() =>
            void leaveOpenPost().then((left) => {
              if (left) void updater.install(writerRef.current?.path() ?? doc.path);
            })
          }
        />
        <ReportBanner
          state={reportState}
          needsSetup={doc.path !== null && doc.path === guidePath && !settings.reportCommand}
          onCancel={report.cancel}
          onDismiss={report.dismiss}
          onOpenGuide={() => {
            report.dismiss();
            void openGuide();
          }}
          onSetUp={setUpReport}
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
            makingDefault={makingDefault}
            onMakeDefault={() => void makeDefaultApp()}
            onChoosePostsFolder={() => void choosePostsFolder()}
            onClearPostsFolder={() => void clearPostsFolder()}
            reportFocus={reportFocus}
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

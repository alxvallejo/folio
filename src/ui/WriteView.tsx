import { isolateHistory } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Compartment, EditorSelection, Prec, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createAutosave, decideDiskChange, type Autosave, type SaveState } from "../editor/autosave";
import { folioContextMenu } from "../editor/contextMenu";
import { createEditor, detectLineSeparator, docText } from "../editor/createEditor";
import { headingsOf } from "../editor/headings";
import { linkKeymap, openLinksOnModClick, pasteLinkHandler, type LinkRequest } from "../editor/links";
import { frontmatterLabel } from "../editor/livePreview";
import { titlePlaceholder } from "../editor/titlePlaceholder";
import { replaceChange, startPosition, titleOf } from "../editor/writer";
import { api } from "../lib/api";
import { basename } from "../lib/paths";
import { readStatus, type PostStatus } from "../posts/frontmatter";
import { postLabel } from "../posts/posts";
import type { Heading } from "../render";
import { ConflictBanner } from "./ConflictBanner";
import { LinkBox } from "./LinkBox";
import { activeHeadingIndex } from "./spy";

export interface WriterHandle {
  flush(): Promise<void>;
  /** The file text, in the file's own line endings. */
  text(): string;
  /** Replaces the text as one undoable step, changing only the span that differs. */
  replace(next: string): void;
  openSearch(): void;
  jumpTo(id: string): void;
  /** Where the post is now: renaming it to follow its title changes this. */
  path(): string;
  view: EditorView;
}

interface Props {
  path: string;
  /** The file's text as last read from disk. */
  diskText: string;
  removed: boolean;
  onState: (s: SaveState) => void;
  onHeadings: (h: Heading[]) => void;
  /** The post's status as the editor text has it, for the toolbar button. */
  onStatus: (s: PostStatus) => void;
  /** The heading whose section is at the top of the editor, for the contents panel. */
  onActiveHeading: (index: number) => void;
  /** The file was renamed to follow the title; later saves go to `to`. */
  onRenamed: (from: string, to: string) => void;
  handleRef: RefObject<WriterHandle | null>;
  notify: (m: string) => void;
}

// The status line and contents panel catch up this long after typing pauses.
const OUTLINE_DELAY_MS = 250;

const sentence = (s: string): string => (s.endsWith(".") ? s : `${s}.`);

function replaceDoc(view: EditorView, next: string) {
  const changes = replaceChange(view.state, next);
  if (changes) view.dispatch({ changes, annotations: isolateHistory.of("full") });
}

/** The title's save state. Held edits (conflict banner up) are not being saved, so say so. */
function shownState(autosave: Autosave): SaveState {
  const state = autosave.state();
  return autosave.isHeld() && state === "unsaved" ? "error" : state;
}

/**
 * The writing view for one post; give each opened post its own key (not its path, which changes
 * when the title renames the file) so each post gets its own autosave.
 */
export function WriteView({ path, diskText, removed, onState, onHeadings, onStatus, onActiveHeading, onRenamed, handleRef, notify }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const autosaveRef = useRef<Autosave | null>(null);
  const [view, setView] = useState<EditorView | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  /** The disk text that arrived while Alex had unsaved edits. */
  const [conflict, setConflict] = useState<string | null>(null);
  const removedRef = useRef(removed);
  const initialText = useRef(diskText).current;
  const seenDiskText = useRef(diskText);

  useEffect(() => {
    removedRef.current = removed;
  }, [removed]);

  const toast = useEffectEvent((message: string) => notify(message));
  const reportState = useEffectEvent((state: SaveState) => onState(state));
  const reportHeadings = useEffectEvent((headings: Heading[]) => onHeadings(headings));
  const reportStatus = useEffectEvent((status: PostStatus) => onStatus(status));
  const reportActive = useEffectEvent((index: number) => onActiveHeading(index));
  const reportRenamed = useEffectEvent((from: string, to: string) => onRenamed(from, to));

  // Layout effect: the contents panel and title switch to this post before the first paint.
  useLayoutEffect(() => {
    const autosave = createAutosave({
      path,
      initialText,
      // Paused while the file is missing (Rust would refuse it anyway); the title shows "not saved".
      save: (p, text) => (removedRef.current ? Promise.reject(new Error("the file no longer exists")) : api.writePost(p, text)),
      onError: (message) => toast(message),
    });
    autosaveRef.current = autosave;

    const label = new Compartment();
    let headings: (Heading & { pos: number })[] = [];
    let outlineTimer = 0;
    let frame = 0;
    // The file name follows the title: renamed when Alex leaves the title line or the post.
    let committedTitle = "";
    let titlePos: number | null = null;
    let wasOnTitle = false;
    let renaming: Promise<void> | null = null;
    let closed = false;

    const view = createEditor({
      parent: hostRef.current!,
      doc: initialText,
      lineSeparator: detectLineSeparator(initialText),
      onDocChange: (text) => {
        autosave.edit(text);
        // An open link box holds positions in the old text (an outside reload, say), so close it.
        setLinkRequest(null);
        window.clearTimeout(outlineTimer);
        outlineTimer = window.setTimeout(refreshOutline, OUTLINE_DELAY_MS);
      },
      extensions: [
        label.of(frontmatterLabel.of(postLabel(initialText))),
        pasteLinkHandler,
        linkKeymap(setLinkRequest),
        openLinksOnModClick((e) => toast(sentence(`Couldn't open link: ${String(e)}`))),
        folioContextMenu(setLinkRequest, (e) => toast(sentence(`Couldn't show the menu: ${String(e)}`))),
        titlePlaceholder,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !update.selectionSet) return;
          if (titlePos !== null) titlePos = update.changes.mapPos(titlePos);
          // Only Alex's own edits rename: an outside reload or a toolbar edit sets the baseline, so
          // a title changed in another editor never moves the file out from under it.
          if (update.docChanged && update.transactions.every((tr) => tr.annotation(Transaction.userEvent) === undefined)) {
            committedTitle = titleOf(update.state)?.text ?? "";
          }
          const onTitle = cursorOnTitle();
          if (wasOnTitle && !onTitle) void syncFileName();
          wasOnTitle = onTitle;
        }),
        // ⌥⌘\ is Folio's contents-panel toggle; stop CodeMirror re-indenting the selection with it.
        // The key still reaches App's shortcut handler.
        Prec.highest(keymap.of([{ key: "Mod-Alt-\\", run: () => true }])),
      ],
    });

    function cursorOnTitle(): boolean {
      if (titlePos === null) return false;
      const { doc, selection } = view.state;
      return doc.lineAt(selection.main.head).number === doc.lineAt(titlePos).number;
    }
    /** Renames the file to match the title if it changed. Never rejects; failures are toasted. */
    function syncFileName(): Promise<void> {
      if (closed) return Promise.resolve();
      if (renaming) return renaming.then(syncFileName);
      const title = titleOf(view.state)?.text ?? "";
      // Not while the conflict banner holds saves or the file is gone: the move writes first.
      if (!title || title === committedTitle || autosave.isHeld() || removedRef.current) return Promise.resolve();
      const from = autosave.path();
      renaming = autosave
        .move((p) => api.renamePost(p, committedTitle, title))
        .then(
          (to) => {
            committedTitle = title;
            if (to !== from) reportRenamed(from, to);
          },
          (e) => {
            // A failed save was already reported, and is retried on the next trigger.
            if (autosave.state() === "error") return;
            committedTitle = title;
            toast(sentence(`Couldn't rename ${basename(from)}: ${String(e)}`));
          },
        )
        .finally(() => {
          renaming = null;
        });
      return renaming;
    }
    function updateActive() {
      frame = 0;
      const scroller = view.scrollDOM;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const tops = headings.map((h) => view.lineBlockAt(h.pos).top);
      reportActive(activeHeadingIndex(tops, scroller.scrollTop - view.documentPadding.top, { atBottom }));
    }
    function refreshOutline() {
      outlineTimer = 0;
      const next = postLabel(docText(view.state));
      if (view.state.facet(frontmatterLabel) !== next) view.dispatch({ effects: label.reconfigure(frontmatterLabel.of(next)) });
      headings = headingsOf(view.state);
      titlePos = headings.find((h) => h.level === 1)?.pos ?? null;
      reportHeadings(headings);
      reportStatus(readStatus(docText(view.state)));
      updateActive();
      // The title changed while the cursor was elsewhere (undo, say).
      if (!cursorOnTitle()) void syncFileName();
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateActive);
    };
    // Not while the conflict banner holds saves: that would overwrite the version it offers.
    const onBlur = () => {
      if (!autosave.isHeld()) autosave.flush().catch(() => {});
    };

    committedTitle = titleOf(view.state)?.text ?? "";
    view.dispatch({ selection: EditorSelection.cursor(startPosition(view.state)), scrollIntoView: true });
    view.focus();
    refreshOutline();
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("blur", onBlur);
    const unsubscribe = autosave.subscribe(() => reportState(shownState(autosave)));
    reportState(shownState(autosave));

    const handle: WriterHandle = {
      view,
      flush: () => syncFileName().then(() => autosave.flush()),
      text: () => docText(view.state),
      path: () => autosave.path(),
      replace: (next) => replaceDoc(view, next),
      openSearch: () => void openSearchPanel(view),
      jumpTo(id) {
        // Fresh, not the debounced list: the click may come right after typing.
        headings = headingsOf(view.state);
        const heading = headings.find((h) => h.id === id);
        if (!heading) return;
        const line = view.state.doc.lineAt(heading.pos);
        view.dispatch({ selection: EditorSelection.cursor(line.to), effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 24 }) });
        view.focus();
      },
    };
    handleRef.current = handle;
    setView(view);

    return () => {
      closed = true;
      if (handleRef.current === handle) handleRef.current = null;
      window.removeEventListener("blur", onBlur);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      window.clearTimeout(outlineTimer);
      cancelAnimationFrame(frame);
      unsubscribe();
      // Writes anything still pending to this post. A failure was already reported through onError.
      autosave.dispose().catch(() => {});
      autosaveRef.current = null;
      view.destroy();
    };
    // Once per post: the parent keys this view by path.
  }, []);

  // The file changed on disk: Folio's own save (ignore), a safe reload, or a conflict to ask about.
  useEffect(() => {
    const autosave = autosaveRef.current;
    if (!view || !autosave || diskText === seenDiskText.current) return;
    seenDiskText.current = diskText;
    const editorText = docText(view.state);
    const decision = decideDiskChange(diskText, autosave, editorText);
    if (decision === "conflict") {
      // Hold timed saves so the outside version stays on disk until Alex chooses. Leaving the
      // post (switch, quit, close, install) still flushes, which keeps his text.
      autosave.hold(diskText);
      setConflict(diskText);
      onState(shownState(autosave));
    } else if (decision === "reload") {
      // Only when everything is saved, so no save is pending or in flight. With the banner up,
      // "saved" means Alex's text is on disk (his save landed) or he's back to the version the
      // banner offered; either way this newer outside version is a plain reload, and the
      // banner's older offer is stale.
      if (autosave.isHeld()) {
        autosave.release();
        setConflict(null);
      }
      replaceDoc(view, diskText);
      autosave.markSaved(diskText);
    } else if (autosave.isHeld() && diskText === editorText && !autosave.isOwnWrite(diskText)) {
      // Someone else wrote exactly what Alex has: nothing left to choose.
      autosave.release();
      autosave.markSaved(diskText);
      setConflict(null);
    }
  }, [diskText, view]);

  const takeDiskVersion = async () => {
    const autosave = autosaveRef.current;
    if (!view || !autosave || conflict === null) return;
    setConflict(null);
    autosave.release();
    replaceDoc(view, conflict);
    autosave.edit(conflict); // already done by the doc change, unless the editor showed it anyway
    view.focus();
    // Write the disk version back if a save in flight put Alex's text on disk. Anything typed
    // meanwhile is an ordinary edit and autosaves after it. A failure is reported through
    // onError and the title.
    await autosave.flush().catch(() => {});
  };

  const keepMine = () => {
    const autosave = autosaveRef.current;
    if (!view || !autosave || conflict === null) return;
    setConflict(null);
    autosave.release();
    // The hold compares against the disk version, so this writes the editor text over it.
    autosave.flush().catch(() => {});
    view.focus();
  };

  return (
    <div className="write-view">
      {removed && (
        <div className="banner" role="alert">
          File no longer exists
        </div>
      )}
      {conflict !== null && !removed && <ConflictBanner onUseDisk={() => void takeDiskVersion()} onKeepMine={keepMine} />}
      <div className="write-editor" ref={hostRef} />
      {view && linkRequest && <LinkBox view={view} request={linkRequest} onClose={() => setLinkRequest(null)} />}
    </div>
  );
}

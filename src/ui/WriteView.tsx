import { isolateHistory } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { Compartment, EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createAutosave, decideDiskChange, type Autosave, type SaveState } from "../editor/autosave";
import { folioContextMenu } from "../editor/contextMenu";
import { createEditor, detectLineSeparator, docText } from "../editor/createEditor";
import { headingsOf } from "../editor/headings";
import { linkKeymap, openLinksOnModClick, pasteLinkHandler, type LinkRequest } from "../editor/links";
import { frontmatterLabel } from "../editor/livePreview";
import { replaceChange, startPosition } from "../editor/writer";
import { api } from "../lib/api";
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
  view: EditorView;
}

interface Props {
  path: string;
  /** The file's text as last read from disk. */
  diskText: string;
  removed: boolean;
  onState: (s: SaveState) => void;
  onHeadings: (h: Heading[]) => void;
  /** The heading whose section is at the top of the editor, for the contents panel. */
  onActiveHeading: (index: number) => void;
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

/** Shows `text`, which is on disk now, and treats it as saved. */
async function showDiskText(view: EditorView, autosave: Autosave, text: string) {
  replaceDoc(view, text);
  autosave.markSaved(text);
  // A save already in flight can land after this and overwrite `text` on disk. The flush queues
  // behind it and, only in that case, writes `text` back.
  await autosave.flush().catch(() => {});
}

/** The writing view for one post; render it with `key={path}` so each post gets its own autosave. */
export function WriteView({ path, diskText, removed, onState, onHeadings, onActiveHeading, handleRef, notify }: Props) {
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
  const reportActive = useEffectEvent((index: number) => onActiveHeading(index));

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

    const view = createEditor({
      parent: hostRef.current!,
      doc: initialText,
      lineSeparator: detectLineSeparator(initialText),
      onDocChange: (text) => {
        autosave.edit(text);
        window.clearTimeout(outlineTimer);
        outlineTimer = window.setTimeout(refreshOutline, OUTLINE_DELAY_MS);
      },
      extensions: [
        label.of(frontmatterLabel.of(postLabel(initialText))),
        pasteLinkHandler,
        linkKeymap(setLinkRequest),
        openLinksOnModClick((e) => toast(sentence(`Couldn't open link: ${String(e)}`))),
        folioContextMenu(setLinkRequest, (e) => toast(sentence(`Couldn't show the menu: ${String(e)}`))),
        // ⌥⌘\ is Folio's contents-panel toggle; stop CodeMirror re-indenting the selection with it.
        // The key still reaches App's shortcut handler.
        Prec.highest(keymap.of([{ key: "Mod-Alt-\\", run: () => true }])),
      ],
    });

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
      reportHeadings(headings);
      updateActive();
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateActive);
    };
    const onBlur = () => void autosave.flush().catch(() => {});

    view.dispatch({ selection: EditorSelection.cursor(startPosition(view.state)), scrollIntoView: true });
    view.focus();
    refreshOutline();
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("blur", onBlur);
    const unsubscribe = autosave.subscribe(() => reportState(autosave.state()));
    reportState(autosave.state());

    const handle: WriterHandle = {
      view,
      flush: () => autosave.flush(),
      text: () => docText(view.state),
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
      setConflict(diskText);
    } else if (decision === "reload") {
      setConflict(null);
      void showDiskText(view, autosave, diskText);
    } else if (diskText === editorText && !autosave.isOwnWrite(diskText)) {
      // Someone else wrote exactly what Alex has. (Folio's own save keeps the banner: autosave
      // may have just written over the version it offers.)
      setConflict(null);
    }
  }, [diskText, view]);

  const takeDiskVersion = () => {
    const autosave = autosaveRef.current;
    if (!view || !autosave || conflict === null) return;
    setConflict(null);
    void showDiskText(view, autosave, conflict);
    view.focus();
  };

  const keepMine = () => {
    const autosave = autosaveRef.current;
    if (!view || !autosave || conflict === null) return;
    setConflict(null);
    // Record the disk version as the last save so the editor text always counts as a change,
    // then write it over the disk version now.
    autosave.markSaved(conflict);
    autosave.edit(docText(view.state));
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
      {conflict !== null && !removed && <ConflictBanner onUseDisk={takeDiskVersion} onKeepMine={keepMine} />}
      <div className="write-editor" ref={hostRef} />
      {view && linkRequest && <LinkBox view={view} request={linkRequest} onClose={() => setLinkRequest(null)} />}
    </div>
  );
}

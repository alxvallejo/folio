import {
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface Link {
  from: number;
  to: number;
  text: string;
  url: string;
}

export interface LinkRequest {
  from: number;
  to: number;
  existing: { url: string; text: string } | null;
  needsText: boolean;
  anchor: { left: number; top: number };
}

/** A link plus where its URL and text sit, for rewriting just those. */
interface LinkParts extends Link {
  urlFrom: number;
  urlTo: number;
}

const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;

/** Whether the whole text is one http(s) or mailto URL. */
export function isLinkUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}

/** The URL as it goes into the doc: one line, and safe inside "(…)" and "<…>". */
function cleanUrl(url: string): string {
  return url
    .trim()
    .replace(/\s+/g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

const oneLine = (text: string): string =>
  text.replace(/\s*[\r\n]+\s*/g, " ").trim();

/** The inline link or autolink ("[text](url)" or "<url>") touching `pos`. */
function findLink(state: EditorState, pos: number): LinkParts | null {
  let found: LinkParts | null = null;
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter(ref) {
      if (ref.name !== "Link" && ref.name !== "Autolink") return;
      const url = ref.node.getChild("URL");
      const marks = ref.node.getChildren("LinkMark");
      if (!url || marks.length < 2) return;
      const urlText = state.sliceDoc(url.from, url.to);
      found = {
        from: ref.from,
        to: ref.to,
        text:
          ref.name === "Autolink"
            ? urlText
            : state.sliceDoc(marks[0].to, marks[1].from),
        url: urlText,
        urlFrom: url.from,
        urlTo: url.to,
      };
    },
  });
  return found;
}

export function linkAt(state: EditorState, pos: number): Link | null {
  const link = findLink(state, pos);
  return (
    link && { from: link.from, to: link.to, text: link.text, url: link.url }
  );
}

/**
 * With a `linkAt` result as `range`, rewrites only that link's URL. Otherwise wraps the range as
 * "[text](url)", or inserts "[text](url)" when the range is empty and `text` is given.
 */
export function setLink(
  state: EditorState,
  range: { from: number; to: number },
  url: string,
  text?: string,
): TransactionSpec {
  const clean = cleanUrl(url);
  if ("url" in range) {
    const link = findLink(state, range.from);
    if (link) {
      return {
        changes: { from: link.urlFrom, to: link.urlTo, insert: clean },
        selection: EditorSelection.cursor(
          link.to + clean.length - link.url.length,
        ),
        userEvent: "input",
      };
    }
  }
  if (range.from === range.to) {
    const label = text === undefined ? "" : oneLine(text);
    const insert = label ? `[${label}](${clean})` : `<${clean}>`;
    return {
      changes: { from: range.from, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      userEvent: "input",
    };
  }
  const tail = `](${clean})`;
  return {
    changes: [
      { from: range.from, insert: "[" },
      { from: range.to, insert: tail },
    ],
    selection: EditorSelection.cursor(range.to + 1 + tail.length),
    userEvent: "input",
  };
}

/** Takes the link away and leaves its text. */
export function removeLink(_state: EditorState, link: Link): TransactionSpec {
  return {
    changes: { from: link.from, to: link.to, insert: link.text },
    selection: EditorSelection.cursor(link.from + link.text.length),
    userEvent: "input",
  };
}

/** What the link box should edit: the link under the cursor, else the selection. */
export function linkRequest(
  state: EditorState,
  anchor = { left: 0, top: 0 },
): LinkRequest {
  const { from, to, head } = state.selection.main;
  const existing = linkAt(state, head);
  if (existing)
    return {
      from: existing.from,
      to: existing.to,
      existing: { url: existing.url, text: existing.text },
      needsText: false,
      anchor,
    };
  return { from, to, existing: null, needsText: from === to, anchor };
}

/** The link box request for the editor's own selection, positioned under the caret. */
export function linkRequestForView(view: EditorView): LinkRequest {
  let anchor = { left: 0, top: 0 };
  try {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (coords) anchor = { left: coords.left, top: coords.bottom };
  } catch {
    // No layout (e.g. detached view): the box falls back to the corner.
  }
  return linkRequest(view.state, anchor);
}

/**
 * Pasting a URL over a selection links it; pasting one at a caret inserts it as "<url>". High
 * precedence because lang-markdown's own paste-as-link handler would otherwise take it first.
 */
export const pasteLinkHandler: Extension = Prec.high(
  EditorView.domEventHandlers({
    paste(event, view) {
      const clip = event.clipboardData?.getData("text/plain") ?? "";
      if (!isLinkUrl(clip)) return false;
      const { from, to } = view.state.selection.main;
      event.preventDefault();
      view.dispatch(setLink(view.state, { from, to }, clip));
      return true;
    },
  }),
);

/** ⌘K asks `open` to show the link box. */
export function linkKeymap(open: (req: LinkRequest) => void): Extension {
  return keymap.of([
    {
      key: "Mod-k",
      run(view) {
        open(linkRequestForView(view));
        return true;
      },
    },
  ]);
}

/** ⌘-click on a link opens it, for http(s) and mailto only; a plain click just moves the cursor. */
export function openLinksOnModClick(
  onError: (error: unknown) => void,
): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || !event.metaKey) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const link = pos === null ? null : linkAt(view.state, pos);
      if (!link || !isLinkUrl(link.url)) return false;
      event.preventDefault();
      openUrl(link.url).catch(onError);
      return true;
    },
  });
}

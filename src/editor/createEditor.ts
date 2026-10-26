import { EditorSelection, EditorState, type Extension, type StateCommand } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap } from "@codemirror/search";
import { editorTheme } from "./editorTheme";
import { livePreview } from "./livePreview";

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  lineSeparator: "\n" | "\r\n";
  onDocChange: (text: string) => void;
  extensions?: Extension[];
}

/** The file's line ending, taken from its first line break. */
export function detectLineSeparator(text: string): "\n" | "\r\n" {
  const i = text.indexOf("\n");
  return i > 0 && text[i - 1] === "\r" ? "\r\n" : "\n";
}

/** The file text, with the file's own line endings. Every save goes through this. */
export function docText(state: EditorState): string {
  return state.sliceDoc();
}

/** How many `ch` sit right before `end`, or right after `start`, in `text`. */
function runBefore(text: string, end: number, ch: string): number {
  let n = 0;
  while (end - n > 0 && text[end - n - 1] === ch) n++;
  return n;
}
function runAfter(text: string, start: number, ch: string): number {
  let n = 0;
  while (start + n < text.length && text[start + n] === ch) n++;
  return n;
}

// "*" is italic only when its run is odd (* or ***); "**" is bold when the run has at least two.
const hasMarker = (marker: "**" | "*", run: number): boolean => (marker === "**" ? run >= 2 : run % 2 === 1);

/** ⌘B / ⌘I: wrap each selection in the marker, or unwrap it when it is already wrapped. */
export function toggleWrap(marker: "**" | "*"): StateCommand {
  const ch = marker[0];
  const len = marker.length;
  return ({ state, dispatch }) => {
    if (state.readOnly) return false;
    const tr = state.changeByRange((range) => {
      const { from, to } = range;
      const before = state.doc.lineAt(from);
      const after = state.doc.lineAt(to);

      // Marks just outside the selection: "**|bold|**".
      if (hasMarker(marker, runBefore(before.text, from - before.from, ch)) && hasMarker(marker, runAfter(after.text, to - after.from, ch))) {
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(range.anchor - len, range.head - len),
        };
      }
      // Marks just inside it: "|**bold**|".
      const inner = state.sliceDoc(from, to);
      if (
        inner.length >= 2 * len &&
        hasMarker(marker, runAfter(inner, 0, ch)) &&
        hasMarker(marker, runBefore(inner, inner.length, ch)) &&
        runAfter(inner, 0, ch) < inner.length
      ) {
        return {
          changes: [
            { from, to: from + len },
            { from: to - len, to },
          ],
          range: range.anchor <= range.head ? EditorSelection.range(from, to - 2 * len) : EditorSelection.range(to - 2 * len, from),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(range.anchor + len, range.head + len),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

// Pasted text uses "\n" or "\r\n" as it pleases; store it with the file's line ending.
const pasteLineBreaks = EditorView.clipboardInputFilter.of((text, state) => text.replace(/\r\n?|\n/g, state.lineBreak));

export function createEditor(opts: EditorOptions): EditorView {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      EditorState.lineSeparator.of(opts.lineSeparator),
      markdown({ base: markdownLanguage }),
      history(),
      keymap.of([
        { key: "Mod-b", run: toggleWrap("**") },
        { key: "Mod-i", run: toggleWrap("*") },
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      search({ top: true }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off", autocapitalize: "off" }),
      pasteLineBreaks,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) opts.onDocChange(docText(update.state));
      }),
      livePreview,
      editorTheme,
      opts.extensions ?? [],
    ],
  });
  return new EditorView({ state, parent: opts.parent });
}

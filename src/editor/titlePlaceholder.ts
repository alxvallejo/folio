import { type EditorState, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { findFrontmatter } from "../posts/frontmatter";

const EMPTY_HEADING = /^#[ \t]*$/;
// Frontmatter and the title sit at the top; looking further would cost a scan per keystroke.
const HEAD_CHARS = 4096;

class TitleHint extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-title-placeholder";
    span.textContent = "Title";
    return span;
  }
}

/** The end of the title line when the post's first line is an empty "# " heading (a new post). */
export function emptyTitleEnd(state: EditorState): number | null {
  const head = state.sliceDoc(0, Math.min(state.doc.length, HEAD_CHARS));
  const fm = findFrontmatter(head);
  let line = state.doc.lineAt(fm && fm !== "unparseable" ? Math.min(fm.end, state.doc.length) : 0);
  while (line.text.trim() === "" && line.number < state.doc.lines && line.to < HEAD_CHARS) line = state.doc.line(line.number + 1);
  return EMPTY_HEADING.test(line.text) ? line.to : null;
}

function build(state: EditorState): DecorationSet {
  const end = emptyTitleEnd(state);
  return end === null ? Decoration.none : Decoration.set([Decoration.widget({ widget: new TitleHint(), side: 1 }).range(end)]);
}

/** Shows a muted "Title" in an empty title heading, where Alex starts typing a new post. */
export const titlePlaceholder = StateField.define<DecorationSet>({
  create: build,
  update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
  provide: (field) => EditorView.decorations.from(field),
});

import { Facet, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { findFrontmatter } from "../posts/frontmatter";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];
type Span = [number, number];

/** The text on the collapsed frontmatter line. The last provided value wins. */
export const frontmatterLabel = Facet.define<string, string>({
  combine: (values) => (values.length ? values[values.length - 1] : ""),
});

/** The leading frontmatter block, from the start of the doc to the end of its closing fence line. */
interface FrontmatterSpan {
  from: number;
  to: number;
}

function locateFrontmatter(state: EditorState): FrontmatterSpan | null {
  // toString() joins lines with "\n", so string offsets are document positions.
  const fm = findFrontmatter(state.doc.toString());
  if (!fm || fm === "unparseable") return null;
  return { from: 0, to: state.doc.lineAt(Math.max(0, fm.end - 1)).to };
}

const frontmatterField = StateField.define<FrontmatterSpan | null>({
  create: locateFrontmatter,
  update: (value, tr) => (tr.docChanged ? locateFrontmatter(tr.state) : value),
});

const touchesSelection = (state: EditorState, from: number, to: number): boolean =>
  state.selection.ranges.some((r) => r.from <= to && r.to >= from);

class FrontmatterWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: FrontmatterWidget): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-frontmatter";
    span.textContent = this.label;
    return span;
  }
  // Let clicks through so they put the cursor in the block, which shows it raw.
  ignoreEvent(): boolean {
    return false;
  }
}

// Provided straight from state (not a plugin) because the replaced range spans line breaks.
const frontmatterDecorations = EditorView.decorations.compute([frontmatterField, "selection", frontmatterLabel], (state) => {
  const fm = state.field(frontmatterField);
  if (!fm || touchesSelection(state, fm.from, fm.to)) return Decoration.none;
  return Decoration.set(Decoration.replace({ widget: new FrontmatterWidget(state.facet(frontmatterLabel)) }).range(fm.from, fm.to));
});

/** Blocks that show raw Markdown when touched: top-level blocks, except that each list item counts on its own. */
function revealedBlocks(state: EditorState): Span[] {
  const spans: Span[] = [];
  for (let block = syntaxTree(state).topNode.firstChild; block; block = block.nextSibling) {
    const units = block.name === "BulletList" || block.name === "OrderedList" ? block.getChildren("ListItem") : [block];
    for (const unit of units) {
      if (touchesSelection(state, unit.from, unit.to)) spans.push([unit.from, unit.to]);
    }
  }
  return spans;
}

const isBlank = (ch: string): boolean => ch === " " || ch === "\t";

/** The text a heading mark takes with it: "## " before the text, " ##" after it. */
function headerMarkSpan(state: EditorState, mark: SyntaxNode): Span {
  const heading = mark.parent;
  let { from, to } = mark;
  if (heading && mark.from === heading.from) {
    while (to < heading.to && isBlank(state.sliceDoc(to, to + 1))) to++;
  } else {
    const lineStart = state.doc.lineAt(from).from;
    while (from > lineStart && isBlank(state.sliceDoc(from - 1, from))) from--;
  }
  return [from, to];
}

/** Keeps ranges inside single lines: a plugin may not replace line breaks. */
function splitAtLineBreaks(state: EditorState, [from, to]: Span): Span[] {
  const out: Span[] = [];
  while (from < to) {
    const line = state.doc.lineAt(from);
    const end = Math.min(to, line.to);
    if (end > from) out.push([from, end]);
    from = line.to + 1;
  }
  return out;
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Span[] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

const LINE_CLASSES: Record<string, string> = {
  ATXHeading1: "cm-h1",
  ATXHeading2: "cm-h2",
  ATXHeading3: "cm-h3",
  ATXHeading4: "cm-h4",
  ATXHeading5: "cm-h5",
  ATXHeading6: "cm-h6",
  SetextHeading1: "cm-h1",
  SetextHeading2: "cm-h2",
  Blockquote: "cm-quote",
  HorizontalRule: "cm-hr",
  FencedCode: "cm-codeblock",
  CodeBlock: "cm-codeblock",
};

/**
 * What live preview does to the doc: syntax marks to hide (outside the blocks the selection touches)
 * and classes for whole lines. The frontmatter block is left alone; its widget handles it.
 */
export function previewRanges(state: EditorState): { hide: Span[]; lineClass: [number, string][] } {
  const field = state.field(frontmatterField, false);
  const fm = field === undefined ? locateFrontmatter(state) : field;
  const revealed = revealedBlocks(state);
  const isRevealed = (from: number, to: number) => revealed.some(([f, t]) => f <= from && to <= t);
  const hide: Span[] = [];
  const lineClass: [number, string][] = [];

  const hideIfHidden = (span: Span) => {
    if (!isRevealed(span[0], span[1])) hide.push(span);
  };

  syntaxTree(state).iterate({
    enter(ref) {
      const cls = LINE_CLASSES[ref.name];
      if (cls) {
        for (let n = state.doc.lineAt(ref.from).number, last = state.doc.lineAt(ref.to).number; n <= last; n++) {
          lineClass.push([state.doc.line(n).from, cls]);
        }
      }
      switch (ref.name) {
        case "HeaderMark":
          hideIfHidden(headerMarkSpan(state, ref.node));
          break;
        case "EmphasisMark":
        case "StrikethroughMark":
          hideIfHidden([ref.from, ref.to]);
          break;
        case "CodeMark":
          if (ref.node.parent?.name === "InlineCode") hideIfHidden([ref.from, ref.to]);
          break;
        case "QuoteMark":
          hideIfHidden([ref.from, state.sliceDoc(ref.to, ref.to + 1) === " " ? ref.to + 1 : ref.to]);
          break;
        case "Link": {
          // "[" before the text, and everything from "]" on: URL, title, reference label.
          const marks = ref.node.getChildren("LinkMark");
          if (marks.length >= 2) {
            hideIfHidden([marks[0].from, marks[0].to]);
            hideIfHidden([marks[1].from, ref.to]);
          }
          break;
        }
      }
    },
  });

  const outside = (pos: number) => !fm || pos > fm.to;
  return {
    hide: mergeSpans(hide.flatMap((span) => splitAtLineBreaks(state, span))).filter(([from]) => outside(from)),
    lineClass: lineClass
      .filter(([pos]) => outside(pos))
      .sort((a, b) => a[0] - b[0])
      .filter(([pos, cls], i, all) => i === 0 || all[i - 1][0] !== pos || all[i - 1][1] !== cls),
  };
}

function previewDecorations(state: EditorState): DecorationSet {
  const { hide, lineClass } = previewRanges(state);
  const ranges: Range<Decoration>[] = [
    ...lineClass.map(([pos, cls]) => Decoration.line({ class: cls }).range(pos)),
    ...hide.map(([from, to]) => Decoration.replace({}).range(from, to)),
  ];
  return Decoration.set(ranges, true);
}

const previewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = previewDecorations(view.state);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = previewDecorations(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Obsidian-style live preview: Markdown marks show only in the blocks being edited. */
export const livePreview: Extension = [frontmatterField, frontmatterDecorations, previewPlugin];

import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { createEditor, detectLineSeparator, docText, toggleWrap } from "./createEditor";

function run(marker: "**" | "*", doc: string, from: number, to: number) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const handled = toggleWrap(marker)({ state, dispatch: (tr: Transaction) => (state = tr.state) });
  return { handled, state, text: state.doc.toString(), selected: state.sliceDoc(state.selection.main.from, state.selection.main.to) };
}

describe("line separators", () => {
  it("detects CRLF", () => {
    expect(detectLineSeparator("a\r\nb")).toBe("\r\n");
    expect(detectLineSeparator("a\nb")).toBe("\n");
    expect(detectLineSeparator("one line")).toBe("\n");
    expect(detectLineSeparator("a\nb\r\nc")).toBe("\n");
  });

  it("round-trips CRLF text", () => {
    const s = EditorState.create({ doc: "a\r\nb\r\n", extensions: EditorState.lineSeparator.of("\r\n") });
    expect(docText(s)).toBe("a\r\nb\r\n");
    expect(docText(s.update({ changes: { from: 1, insert: "!" } }).state)).toBe("a!\r\nb\r\n");
  });
});

describe("toggleWrap", () => {
  it("⌘B wraps and unwraps the selection", () => {
    const wrapped = run("**", "a bold b", 2, 6);
    expect(wrapped.handled).toBe(true);
    expect(wrapped.text).toBe("a **bold** b");
    expect(wrapped.selected).toBe("bold");
    const { from, to } = wrapped.state.selection.main;
    const unwrapped = run("**", wrapped.text, from, to);
    expect(unwrapped.text).toBe("a bold b");
    expect(unwrapped.selected).toBe("bold");
  });

  it("⌘I wraps and unwraps the selection", () => {
    const wrapped = run("*", "a bold b", 2, 6);
    expect(wrapped.text).toBe("a *bold* b");
    expect(wrapped.selected).toBe("bold");
    const { from, to } = wrapped.state.selection.main;
    expect(run("*", wrapped.text, from, to).text).toBe("a bold b");
  });

  it("tells bold and italic apart", () => {
    expect(run("*", "a **bold** b", 4, 8).text).toBe("a ***bold*** b");
    expect(run("**", "a *it* b", 3, 5).text).toBe("a ***it*** b");
    expect(run("*", "a ***x*** b", 5, 6).text).toBe("a **x** b");
    expect(run("**", "a ***x*** b", 5, 6).text).toBe("a *x* b");
  });

  it("unwraps a selection that includes the marks", () => {
    const r = run("**", "a **bold** b", 2, 10);
    expect(r.text).toBe("a bold b");
    expect(r.selected).toBe("bold");
  });

  it("puts the cursor between new marks when nothing is selected, and removes empty marks", () => {
    const r = run("**", "ab", 1, 1);
    expect(r.text).toBe("a****b");
    expect(r.state.selection.main.head).toBe(3);
    expect(run("**", r.text, 3, 3).text).toBe("ab");
  });
});

describe("createEditor", () => {
  it("keeps CRLF text byte-identical and reports edits with the file's line endings", () => {
    const parent = document.createElement("div");
    const doc = "---\r\nstatus: draft\r\n---\r\n\r\n# Title\r\n\r\nBody\r\n";
    const changes: string[] = [];
    const view = createEditor({ parent, doc, lineSeparator: detectLineSeparator(doc), onDocChange: (t) => changes.push(t) });
    expect(docText(view.state)).toBe(doc);
    expect(changes).toEqual([]);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "More" } });
    expect(changes).toEqual([doc + "More"]);
    view.destroy();
  });

  it("turns pasted line breaks into the file's line breaks", () => {
    const parent = document.createElement("div");
    const view = createEditor({ parent, doc: "a\r\n", lineSeparator: "\r\n", onDocChange: () => {} });
    view.dispatch(view.state.replaceSelection(view.state.toText("x")));
    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "p\nq\r\nr" } });
    view.contentDOM.dispatchEvent(event);
    expect(docText(view.state)).toBe("xp\r\nq\r\nra\r\n");
    view.destroy();
  });
});

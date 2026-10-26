import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { docText } from "./createEditor";
import { replaceChange, saveSuffix, startPosition } from "./writer";

const state = (doc: string, lineSeparator?: "\r\n", cursor = 0) =>
  EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: lineSeparator ? EditorState.lineSeparator.of(lineSeparator) : [],
  });

const lineAtStart = (s: EditorState) => s.doc.lineAt(startPosition(s)).text;

describe("startPosition", () => {
  it("puts a new post's cursor on the line after its title", () => {
    const s = state("---\nstatus: draft\n---\n\n# Title\n");
    expect(startPosition(s)).toBe(s.doc.length);
  });

  it("uses the first top-level heading, not a smaller one or one in code", () => {
    expect(lineAtStart(state("## Sub\n# Main\nText"))).toBe("Text");
    expect(lineAtStart(state("```\n# not\n```\n# Real\nAfter"))).toBe("After");
  });

  it("skips a setext underline", () => {
    expect(lineAtStart(state("Main\n====\nText"))).toBe("Text");
  });

  it("stays on the title line when nothing follows it", () => {
    const s = state("# Only");
    expect(startPosition(s)).toBe(6);
  });

  it("falls back to the start of the body, past the frontmatter", () => {
    expect(startPosition(state("---\nstatus: draft\n---\nIntro\n"))).toBe(22);
    expect(startPosition(state("No heading here"))).toBe(0);
  });

  it("works in a CRLF document", () => {
    expect(lineAtStart(state("---\r\nstatus: draft\r\n---\r\n\r\n# T\r\nBody", "\r\n"))).toBe("Body");
  });
});

describe("replaceChange", () => {
  it("changes only the part that differs", () => {
    const s = state("one\ntwo\nthree");
    expect(replaceChange(s, "one\nTWO\nthree")).toMatchObject({ from: 4, to: 7 });
  });

  it("is null when nothing changed", () => {
    expect(replaceChange(state("same\n"), "same\n")).toBeNull();
  });

  it("keeps a CRLF document's line endings, with no bare LF inside a line", () => {
    const s = state("a\r\nb\r\nc", "\r\n");
    const next = "a\r\nx\r\ny\r\nb\r\nc";
    const after = s.update({ changes: replaceChange(s, next)! }).state;
    expect(docText(after)).toBe(next);
    expect(after.doc.lines).toBe(5);
    expect(after.doc.toString()).not.toContain("\r");
  });

  it("keeps the cursor where it was, clamped to the new text", () => {
    const s = state("hello world", undefined, 11);
    const after = s.update({ changes: replaceChange(s, "hello")! }).state;
    expect(after.selection.main.head).toBe(5);

    const t = state("intro\nbody", undefined, 2);
    expect(t.update({ changes: replaceChange(t, "intro\nnew body")! }).state.selection.main.head).toBe(2);
  });
});

describe("saveSuffix", () => {
  it("words each save state for the title", () => {
    expect(saveSuffix("saved")).toBe(" · saved");
    expect(saveSuffix("saving")).toBe(" · saving…");
    expect(saveSuffix("unsaved")).toBe(" · saving…");
    expect(saveSuffix("error")).toBe(" · not saved");
  });
});

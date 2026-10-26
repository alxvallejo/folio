import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMarkdown, type RenderEnv } from "../render/markdown";
import { stripFrontmatter } from "../posts/frontmatter";
import { headingsOf } from "./headings";

const state = (doc: string, lineSeparator?: string) =>
  EditorState.create({ doc, extensions: lineSeparator ? EditorState.lineSeparator.of(lineSeparator) : [] });

describe("headingsOf", () => {
  it("finds headings with reader slugs", () => {
    expect(headingsOf(state("# Hi\n\n## Hi\n")).map((h) => h.id)).toEqual(["hi", "hi-1"]);
  });

  it("matches the reader's headings and points at each heading's line", () => {
    const doc = "---\nstatus: draft\n---\n\n# A *b* `c`\n\nText\n\nSetext\n---\n\n##### Deep\n\n> ### Quoted [link](x)\n";
    const env: RenderEnv = {};
    createMarkdown().render(stripFrontmatter(doc), env);
    const found = headingsOf(state(doc));
    expect(found.map(({ level, text, id }) => ({ level, text, id }))).toEqual(env.headings);
    expect(found.map((h) => h.pos)).toEqual([doc.indexOf("# A"), doc.indexOf("Setext"), doc.indexOf("> ###")]);
  });

  it("gives document positions in a CRLF document", () => {
    const doc = "# One\r\n\r\n## Two\r\n";
    const s = state(doc, "\r\n");
    expect(headingsOf(s).map((h) => s.doc.lineAt(h.pos).text)).toEqual(["# One", "## Two"]);
  });
});

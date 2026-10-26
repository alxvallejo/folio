import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { frontmatterLabel, livePreview, previewRanges } from "./livePreview";

const at = (doc: string, cursor: number) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: markdown({ base: markdownLanguage }) });

describe("previewRanges", () => {
  it("hides marks away from the cursor and shows them on the cursor's block", () => {
    const doc = "## Why\n\nSome **bold** text";
    const away = previewRanges(at(doc, doc.length));
    expect(away.hide).toContainEqual([0, 3]); // "## "
    const on = previewRanges(at(doc, 4));
    expect(on.hide.some(([f]) => f === 0)).toBe(false);
    expect(on.hide).toContainEqual([13, 15]); // "**" of bold, other block
  });

  it("hides link syntax but keeps the text", () => {
    const r = previewRanges(at("[Tauri](https://tauri.app)\n\nx", 28));
    expect(r.hide).toEqual(expect.arrayContaining([[0, 1], [6, 26]]));
  });

  it("hides a link's title along with its URL", () => {
    const doc = 'A [Tauri](https://tauri.app "Tauri") link\n\nx';
    expect(previewRanges(at(doc, doc.length)).hide).toEqual([[2, 3], [8, 36]]);
  });

  it("hides inline code marks and quote marks but keeps fences and bullets", () => {
    const doc = "Run `npm i` now\n\n> quoted\n> more\n\n```js\nx\n```\n\n- item\n\nend";
    const hide = previewRanges(at(doc, doc.length)).hide;
    expect(hide).toEqual(expect.arrayContaining([[4, 5], [10, 11], [17, 19], [26, 28]]));
    const fence = doc.indexOf("```");
    const bullet = doc.indexOf("- item");
    expect(hide.some(([f, t]) => f < fence + 3 && t > fence)).toBe(false);
    expect(hide.some(([f, t]) => f <= bullet && t > bullet)).toBe(false);
  });

  it("returns sorted, merged ranges", () => {
    const doc = "***both*** and **x**\n\nend";
    const hide = previewRanges(at(doc, doc.length)).hide;
    for (let i = 1; i < hide.length; i++) expect(hide[i][0]).toBeGreaterThan(hide[i - 1][1]);
    expect(hide).toEqual([[0, 3], [7, 10], [15, 17], [18, 20]]);
  });

  it("reveals every block a selection touches", () => {
    const doc = "**a**\n\n**b**\n\n**c**";
    const state = EditorState.create({ doc, selection: { anchor: 2, head: 9 }, extensions: markdown({ base: markdownLanguage }) });
    expect(previewRanges(state).hide).toEqual([[14, 16], [17, 19]]);
  });

  it("reveals only the list item under the cursor", () => {
    const doc = "- **a**\n- **b**";
    expect(previewRanges(at(doc, 4)).hide).toEqual([[10, 12], [13, 15]]);
  });

  it("classes heading, quote, rule and code block lines", () => {
    const doc = "# One\n\n> q\n\n---\n\n```\ncode\n```\n\nTwo\n===\n\nend";
    const { lineClass } = previewRanges(at(doc, doc.length));
    const line = (text: string) => doc.indexOf(text);
    expect(lineClass).toEqual(
      expect.arrayContaining([
        [0, "cm-h1"],
        [line("> q"), "cm-quote"],
        [line("---"), "cm-hr"],
        [line("```"), "cm-codeblock"],
        [line("code"), "cm-codeblock"],
        [line("```\n\nTwo"), "cm-codeblock"],
        [line("Two"), "cm-h1"],
        [line("==="), "cm-h1"],
      ]),
    );
    for (let i = 1; i < lineClass.length; i++) expect(lineClass[i][0]).toBeGreaterThanOrEqual(lineClass[i - 1][0]);
  });

  it("leaves frontmatter to the frontmatter widget", () => {
    const doc = "---\nstatus: draft\n---\n\n## Why\n\nend";
    const { hide, lineClass } = previewRanges(at(doc, doc.length));
    expect(hide).toEqual([[23, 26]]);
    expect(lineClass).toEqual([[23, "cm-h2"]]);
  });

  it("treats a leading rule that isn't frontmatter as a rule", () => {
    const doc = "---\nSome intro\n---\n\nend";
    expect(previewRanges(at(doc, doc.length)).lineClass).toContainEqual([0, "cm-hr"]);
  });
});

describe("livePreview in a view", () => {
  const mount = (doc: string, cursor: number) =>
    new EditorView({
      parent: document.createElement("div"),
      state: EditorState.create({
        doc,
        selection: { anchor: cursor },
        extensions: [markdown({ base: markdownLanguage }), livePreview, frontmatterLabel.of("Ignored"), frontmatterLabel.of("Draft")],
      }),
    });

  it("collapses frontmatter to its label until the cursor enters it", () => {
    const doc = "---\nstatus: draft\n---\n\nSome **bold**";
    const view = mount(doc, doc.length);
    const label = () => view.contentDOM.querySelector(".cm-frontmatter")?.textContent;
    expect(label()).toBe("Draft");
    expect(view.contentDOM.textContent).not.toContain("status:");
    view.dispatch({ selection: { anchor: 5 } });
    expect(label()).toBeUndefined();
    expect(view.contentDOM.textContent).toContain("status: draft");
    view.destroy();
  });

  it("hides marks in the DOM and copes with a link split across lines", () => {
    const doc = "Some **bold** and [a](\n/url)\n\nend";
    const view = mount(doc, doc.length);
    expect(view.contentDOM.textContent).not.toContain("**");
    expect(view.contentDOM.textContent).not.toContain("/url");
    view.destroy();
  });
});

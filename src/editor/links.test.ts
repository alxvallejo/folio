import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { createEditor } from "./createEditor";
import { isLinkUrl, linkAt, linkRequest, pasteLinkHandler, removeLink, setLink } from "./links";
import { contextMenuKind } from "./contextMenu";

const md = markdown({ base: markdownLanguage });
const stateOf = (doc: string) => EditorState.create({ doc, extensions: md });
const apply = (s: EditorState, spec: TransactionSpec) => s.update(spec).state.doc.toString();

describe("links", () => {
  it("recognises URLs", () => {
    expect(isLinkUrl(" https://tauri.app/start ")).toBe(true);
    expect(isLinkUrl("mailto:a@b.co")).toBe(true);
    expect(isLinkUrl("see https://x.y")).toBe(false);
    expect(isLinkUrl("tauri.app")).toBe(false);
    expect(isLinkUrl("https://a.b\nhttps://c.d")).toBe(false);
  });

  it("wraps a selection and edits an existing link", () => {
    const s = stateOf("a Tauri prototype");
    expect(apply(s, setLink(s, { from: 2, to: 17 }, "https://tauri.app"))).toBe("a [Tauri prototype](https://tauri.app)");
    const l = stateOf("[x](https://a.b) y");
    expect(apply(l, setLink(l, linkAt(l, 1)!, "https://c.d"))).toBe("[x](https://c.d) y");
    expect(apply(l, removeLink(l, linkAt(l, 1)!))).toBe("x y");
  });

  it("finds links and ignores plain text", () => {
    expect(linkAt(stateOf("<https://a.b>"), 3)?.url).toBe("https://a.b");
    expect(linkAt(stateOf("a [x](https://a.b) y"), 5)).toEqual({ from: 2, to: 18, text: "x", url: "https://a.b" });
    expect(linkAt(stateOf("a [x](https://a.b) y"), 0)).toBeNull();
    expect(linkAt(stateOf("a [x](https://a.b) y"), 19)).toBeNull();
  });

  it("edits and removes an autolink", () => {
    const s = stateOf("see <https://a.b> now");
    expect(apply(s, setLink(s, linkAt(s, 6)!, "https://c.d"))).toBe("see <https://c.d> now");
    expect(apply(s, removeLink(s, linkAt(s, 6)!))).toBe("see https://a.b now");
  });

  it("inserts link text when nothing is selected", () => {
    const s = stateOf("");
    expect(apply(s, setLink(s, { from: 0, to: 0 }, "https://a.b", "here"))).toBe("[here](https://a.b)");
  });

  it("keeps URLs on one line and safe inside the parentheses", () => {
    const s = stateOf("x");
    expect(apply(s, setLink(s, { from: 0, to: 1 }, " https://a.b/a b(1)\n "))).toBe("[x](https://a.b/a%20b%281%29)");
  });

  it("builds a request for the selection or the link under the cursor", () => {
    const sel = EditorState.create({ doc: "a Tauri b", extensions: md, selection: EditorSelection.single(2, 7) });
    expect(linkRequest(sel)).toMatchObject({ from: 2, to: 7, existing: null, needsText: false });
    const caret = EditorState.create({ doc: "a b", extensions: md, selection: EditorSelection.single(1) });
    expect(linkRequest(caret)).toMatchObject({ from: 1, to: 1, existing: null, needsText: true });
    const inLink = EditorState.create({ doc: "[x](https://a.b)", extensions: md, selection: EditorSelection.single(1) });
    expect(linkRequest(inLink)).toMatchObject({ from: 0, to: 16, existing: { url: "https://a.b", text: "x" }, needsText: false });
  });

  it("chooses Folio's menu only for a prior selection or a link", () => {
    expect(contextMenuKind({ empty: false }, false)).toBe("folio");
    expect(contextMenuKind({ empty: true }, true)).toBe("folio");
    expect(contextMenuKind({ empty: true }, false)).toBe("native");
  });
});

function paste(doc: string, from: number, to: number, clip: string, lineSeparator: "\n" | "\r\n" = "\n") {
  const view = createEditor({ parent: document.body, doc, lineSeparator, onDocChange: () => {}, extensions: [pasteLinkHandler] });
  view.dispatch({ selection: EditorSelection.single(from, to) });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? clip : "") } });
  view.contentDOM.dispatchEvent(event);
  const out = { text: view.state.doc.toString(), prevented: event.defaultPrevented };
  view.destroy();
  return out;
}

describe("pasteLinkHandler", () => {
  it("turns a pasted URL over a selection into a link", () => {
    expect(paste("a Tauri b", 2, 7, "https://tauri.app\n")).toEqual({ text: "a [Tauri](https://tauri.app) b", prevented: true });
  });
  it("inserts a bare pasted URL as an autolink", () => {
    expect(paste("a  b", 2, 2, "https://tauri.app")).toEqual({ text: "a <https://tauri.app> b", prevented: true });
  });
  it("leaves other pastes to the default handler", () => {
    expect(paste("a b", 1, 2, "just text").text).toBe("ajust textb");
    expect(paste("a b", 1, 2, "see https://x.y").text).toBe("asee https://x.yb");
  });
  it("pastes plainly inside fenced code", () => {
    expect(paste("```\ncode\n```", 6, 6, "https://c.d")).toEqual({ text: "```\ncohttps://c.dde\n```", prevented: true });
    expect(paste("```\ncode\n```", 4, 8, "https://c.d").text).toBe("```\nhttps://c.d\n```");
  });
  it("pastes plainly inside inline code, and links just after it", () => {
    expect(paste("a `x` b", 3, 3, "https://c.d").text).toBe("a `https://c.dx` b");
    expect(paste("a `x` b", 3, 4, "https://c.d").text).toBe("a `https://c.d` b");
    expect(paste("a `x` b", 6, 6, "https://c.d").text).toBe("a `x` <https://c.d>b");
  });
  it("pastes plainly inside frontmatter", () => {
    expect(paste("---\nurl: \n---\nbody", 9, 9, "https://c.d").text).toBe("---\nurl: https://c.d\n---\nbody");
    expect(paste("---\ntitle: My post\n---\nbody", 11, 18, "https://c.d").text).toBe("---\ntitle: https://c.d\n---\nbody");
    expect(paste("---\ntitle: x\n---\nbody", 17, 21, "https://c.d").text).toBe("---\ntitle: x\n---\n[body](https://c.d)");
  });
  it("replaces a selected URL instead of linking it", () => {
    expect(paste("see https://a.b now", 4, 15, "https://c.d").text).toBe("see https://c.d now");
  });
  it("pastes plainly into the URL part of a link", () => {
    expect(paste("[x](https://a.b)", 4, 15, "https://c.d").text).toBe("[x](https://c.d)");
    expect(paste("[x](./a.md)", 4, 10, "https://c.d").text).toBe("[x](https://c.d)");
    expect(paste("[x](https://a.b)", 4, 4, "https://c.d").text).toBe("[x](https://c.dhttps://a.b)");
    expect(paste("<https://a.b>", 1, 12, "https://c.d").text).toBe("<https://c.d>");
  });
  it("works in a CRLF document", () => {
    expect(paste("one\r\ntwo", 0, 3, "https://a.b", "\r\n").text).toBe("[one](https://a.b)\ntwo");
  });
});

import type { ChangeSpec, EditorState } from "@codemirror/state";
import { findFrontmatter } from "../posts/frontmatter";
import type { SaveState } from "./autosave";
import { headingsOf } from "./headings";

const SETEXT_UNDERLINE = /^ {0,3}=+[ \t]*$/;

/**
 * Where the cursor starts in a freshly opened post: the line after the first top-level heading,
 * else the start of the body. Position 0 would sit inside the frontmatter and show it raw.
 */
export function startPosition(state: EditorState): number {
  const { doc } = state;
  const title = headingsOf(state).find((h) => h.level === 1);
  if (title) {
    let line = doc.lineAt(title.pos);
    if (line.number < doc.lines && SETEXT_UNDERLINE.test(doc.line(line.number + 1).text)) line = doc.line(line.number + 1);
    return line.number < doc.lines ? doc.line(line.number + 1).from : line.to;
  }
  // toString() joins lines with "\n", so the string offset is a document position.
  const fm = findFrontmatter(doc.toString());
  return fm && fm !== "unparseable" ? Math.min(fm.end, doc.length) : 0;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * The single change that turns the document into `next` (file text, in the file's line endings),
 * touching only the span that differs so the cursor and scroll stay put. Null when nothing differs.
 */
export function replaceChange(state: EditorState, next: string): ChangeSpec | null {
  // Split `next` on the doc's own separator; inserting a plain "\n"-joined string into a CRLF
  // doc would leave bare line feeds inside lines.
  const target = state.toText(next);
  const a = state.doc.toString();
  const b = target.toString();
  if (a === b) return null;
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(a.charCodeAt(start - 1))) start--;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: target.slice(start, endB) };
}

/** The toolbar title's save note. A pending save reads as "saving…": it starts within a second. */
export function saveSuffix(state: SaveState): string {
  switch (state) {
    case "saved":
      return " · saved";
    case "saving":
    case "unsaved":
      return " · saving…";
    case "error":
      return " · not saved";
  }
}

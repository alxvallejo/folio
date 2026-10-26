import type { EditorState } from "@codemirror/state";
import { findFrontmatter } from "../posts/frontmatter";
import { createMarkdown, type Heading, type RenderEnv } from "../render/markdown";

// The reader's own parser, so ids (and which headings count) can't drift from the reading view.
const md = createMarkdown();

const LINE_BREAK = /\r\n?|\n/g;

function lineStarts(text: string): number[] {
  const starts = [0];
  for (const m of text.matchAll(LINE_BREAK)) starts.push(m.index! + m[0].length);
  return starts;
}

/** The headings the reader would list for this document, each with the position of its first line. */
export function headingsOf(state: EditorState): (Heading & { pos: number })[] {
  // toString() joins lines with "\n", so string offsets are document positions whatever the file's line endings.
  const text = state.doc.toString();
  const fm = findFrontmatter(text);
  const offset = fm && fm !== "unparseable" ? fm.end : 0;
  const body = text.slice(offset);
  const env: RenderEnv = {};
  const starts = lineStarts(body);
  const positions = md
    .parse(body, env)
    .filter((t) => t.type === "heading_open" && Number(t.tag.slice(1)) <= 4)
    .map((t) => offset + starts[t.map ? t.map[0] : 0]);
  return (env.headings ?? []).map((heading, i) => ({ ...heading, pos: positions[i] }));
}

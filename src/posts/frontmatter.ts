export type PostStatus = "draft" | "published";

export interface Frontmatter {
  start: 0;
  /** Offset just past the closing fence line's newline (or the end of the text). */
  end: number;
  /** The raw lines between the fences, without line endings. */
  lines: string[];
}

// Line-based on purpose: edits touch only the lines they must, so every other byte survives.
const LINE = /[^\n]*\n|[^\n]+$/g;
const KEY_LINE = /^[A-Za-z0-9_-]+:(\s|$)/;
const STATUS_LINE = /^status:/;
const PUBLISHED_LINE = /^published:/;

const splitLines = (text: string): string[] => text.match(LINE) ?? [];
const content = (line: string): string => line.replace(/\r?\n$/, "");
const eolOf = (line: string): string => line.slice(content(line).length);

/** A line that can sit inside a frontmatter block. Anything else means it is not frontmatter. */
function isFrontmatterLine(line: string): boolean {
  return line.trim() === "" || /^[ \t#]/.test(line) || line.startsWith("- ") || line === "-" || KEY_LINE.test(line);
}

export function findFrontmatter(text: string): Frontmatter | null | "unparseable" {
  const all = splitLines(text);
  if (all.length === 0 || content(all[0]) !== "---") return null;

  const lines: string[] = [];
  let end = all[0].length;
  for (let i = 1; i < all.length; i++) {
    const line = content(all[i]);
    end += all[i].length;
    // A block needs a key; rules around a heading or blank lines are just Markdown.
    if (line === "---" || line === "...") return lines.some((l) => KEY_LINE.test(l)) ? { start: 0, end, lines } : null;
    if (!isFrontmatterLine(line)) return null;
    lines.push(line);
  }

  // No closing fence: refuse to touch it only if it looks like a block that lost its fence.
  const head: string[] = [];
  for (const raw of all.slice(1)) {
    const line = content(raw);
    if (line.trim() === "") break;
    head.push(line);
  }
  return head.length > 0 && head.every((l) => KEY_LINE.test(l)) ? "unparseable" : null;
}

export function stripFrontmatter(text: string): string {
  const fm = findFrontmatter(text);
  return fm && fm !== "unparseable" ? text.slice(fm.end) : text;
}

function statusValue(line: string): string {
  return line.replace(STATUS_LINE, "").trim().replace(/^(["'])(.*)\1$/, "$2");
}

export function readStatus(text: string): PostStatus {
  const fm = findFrontmatter(text);
  if (!fm || fm === "unparseable") return "draft";
  const line = fm.lines.find((l) => STATUS_LINE.test(l));
  return line !== undefined && statusValue(line) === "published" ? "published" : "draft";
}

export function setStatus(
  text: string,
  status: PostStatus,
  today: string,
): { ok: true; text: string } | { ok: false } {
  const fm = findFrontmatter(text);
  if (fm === "unparseable") return { ok: false };

  if (fm === null) {
    // Starts with a fence we can't read as frontmatter: adding a block above it would stack two.
    if (content(splitLines(text)[0] ?? "") === "---") return { ok: false };
    const eol = eolOf(splitLines(text)[0] ?? "") === "\r\n" ? "\r\n" : "\n";
    const published = status === "published" ? `published: ${today}${eol}` : "";
    return { ok: true, text: `---${eol}status: ${status}${eol}${published}---${eol}${eol}${text}` };
  }

  const block = splitLines(text.slice(0, fm.end));
  const rest = text.slice(fm.end);
  const hasPublished = block.slice(1, -1).some((l) => PUBLISHED_LINE.test(l));
  const addPublished = status === "published" && !hasPublished;

  const at = block.findIndex((l, i) => i > 0 && i < block.length - 1 && STATUS_LINE.test(l));
  if (at === -1) {
    const eol = eolOf(block[0]) || "\n";
    const inserted = [`status: ${status}${eol}`];
    if (addPublished) inserted.push(`published: ${today}${eol}`);
    block.splice(1, 0, ...inserted);
  } else {
    const eol = eolOf(block[at]);
    if (statusValue(content(block[at])) !== status) block[at] = `status: ${status}${eol}`;
    if (addPublished) block.splice(at + 1, 0, `published: ${today}${eol || "\n"}`);
  }
  return { ok: true, text: block.join("") + rest };
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

import { createMarkdown } from "../render/markdown";
import { sanitize } from "../render/postprocess";
import { stripFrontmatter } from "./frontmatter";

export interface SubstackCopy {
  html: string;
  /** The Markdown body, as the plain-text alternative on the clipboard. */
  text: string;
  droppedTitle: boolean;
  droppedImages: number;
}

// Substack takes the title in its own field, so a leading "# Title" line is left out.
const TITLE_LINE = /^#[ \t]+[^\r\n]*(\r\n|\n|$)/;

/** Formatted HTML and plain text for pasting a post into Substack's editor. */
export function toSubstack(markdown: string): SubstackCopy {
  let body = stripFrontmatter(markdown).replace(/^(\s*\r?\n)+/, "");
  const droppedTitle = TITLE_LINE.test(body);
  if (droppedTitle) body = body.replace(TITLE_LINE, "").replace(/^(\s*\r?\n)+/, "");

  const doc = new DOMParser().parseFromString(`<body>${sanitize(createMarkdown().render(body))}</body>`, "text/html");
  let droppedImages = 0;
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    if (/^https?:\/\//i.test(img.getAttribute("src") ?? "")) continue;
    const parent = img.parentElement;
    img.remove();
    droppedImages++;
    if (parent && parent.tagName === "P" && !parent.textContent?.trim() && parent.children.length === 0) parent.remove();
  }
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    for (const name of el.getAttributeNames()) {
      if (name === "id" || name === "class" || name === "style" || name.startsWith("data-")) el.removeAttribute(name);
    }
  }
  return { html: doc.body.innerHTML, text: body, droppedTitle, droppedImages };
}

/** The toast after copying. */
export function copyMessage(r: Pick<SubstackCopy, "droppedTitle" | "droppedImages">): string {
  const title = r.droppedTitle ? " (title left out)" : "";
  const n = r.droppedImages;
  const images = n > 0 ? ` Left out ${n} local ${n === 1 ? "image" : "images"}.` : "";
  return `Copied for Substack${title}.${images}`;
}

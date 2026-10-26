import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Inline Markdown gets plain class names; the theme below styles them like .prose (src/styles/prose.css).
const markdownClasses = HighlightStyle.define([
  { tag: tags.strong, class: "cm-strong" },
  { tag: tags.emphasis, class: "cm-em" },
  { tag: tags.strikethrough, class: "cm-strike" },
  // Not tags.link: Lezer tags every "[…]" as a link. Live preview marks the real ones with cm-link.
  { tag: tags.url, class: "cm-link" },
  { tag: tags.monospace, class: "cm-inline-code" },
  { tag: [tags.processingInstruction, tags.labelName, tags.string], class: "cm-syntax" },
]);

const headingLines = ".cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6";

// The same theme variables as the reading view, so a post looks the same while it's being written.
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--bg)", color: "var(--fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "var(--line-height)" },
  ".cm-content": {
    maxWidth: "var(--max-width)",
    margin: "0 auto",
    padding: "48px 32px 40vh",
    fontSize: "var(--font-size)",
    caretColor: "var(--fg)",
  },
  ".cm-line": { padding: "0" },

  [headingLines]: {
    fontFamily: "var(--font-heading)",
    fontWeight: "var(--heading-weight)",
    fontStyle: "var(--heading-style)",
    letterSpacing: "var(--heading-tracking)",
    lineHeight: "1.12",
    color: "var(--heading)",
  },
  ".cm-h1": { fontSize: "2.4em" },
  ".cm-h2": { fontSize: "1.6em", paddingBottom: ".2em", borderBottom: "1px solid var(--border)" },
  ".cm-h3": { fontSize: "1.25em" },
  ".cm-h4": { fontSize: "1.05em" },
  ".cm-h5, .cm-h6": { fontSize: "1em", color: "var(--muted)" },

  ".cm-strong": { fontWeight: "650" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strike": { textDecoration: "line-through" },
  ".cm-link": {
    color: "var(--link)",
    textDecoration: "underline",
    textDecorationColor: "var(--link-underline)",
    textDecorationThickness: ".08em",
    textUnderlineOffset: ".18em",
  },
  ".cm-inline-code": {
    padding: ".12em .36em",
    borderRadius: "4px",
    fontFamily: "var(--font-code)",
    fontSize: ".86em",
    background: "color-mix(in srgb, var(--fg) 7%, transparent)",
  },
  ".cm-syntax, .cm-hr": { color: "var(--muted)" },
  ".cm-quote": { paddingLeft: "1em", borderLeft: "3px solid var(--quote)", color: "var(--muted)" },
  ".cm-codeblock": {
    padding: "0 18px",
    fontFamily: "var(--font-code)",
    fontSize: ".84em",
    lineHeight: "1.55",
    background: "var(--code-bg)",
    color: "var(--code-fg)",
  },
  ".cm-codeblock .cm-inline-code": { padding: "0", fontSize: "inherit", background: "none" },
  ".cm-codeblock .cm-syntax": { color: "inherit", opacity: ".6" },
  ".cm-frontmatter": { color: "var(--muted)", fontSize: ".86em" },
  ".cm-title-placeholder": { color: "var(--muted)", opacity: ".6", pointerEvents: "none" },

  ".cm-panels": { backgroundColor: "var(--bg)", color: "var(--fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-searchMatch": { backgroundColor: "var(--highlight)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--link)", color: "var(--bg)" },
});

export const editorTheme: Extension = [theme, syntaxHighlighting(markdownClasses)];

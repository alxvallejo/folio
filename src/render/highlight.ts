import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { Highlight } from "./markdown";

export const SHIKI_THEMES = [
  "github-light",
  "github-dark",
  "min-light",
  "min-dark",
  "catppuccin-latte",
  "catppuccin-mocha",
  "nord",
  "rose-pine-dawn",
  "rose-pine-moon",
] as const;

export type ShikiTheme = (typeof SHIKI_THEMES)[number];

export interface ThemePair {
  light: ShikiTheme;
  dark: ShikiTheme;
}

let highlighter: Promise<HighlighterCore> | null = null;

/** One highlighter with every preset theme loaded, created on first use and reused. */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [
      import("@shikijs/themes/github-light"),
      import("@shikijs/themes/github-dark"),
      import("@shikijs/themes/min-light"),
      import("@shikijs/themes/min-dark"),
      import("@shikijs/themes/catppuccin-latte"),
      import("@shikijs/themes/catppuccin-mocha"),
      import("@shikijs/themes/nord"),
      import("@shikijs/themes/rose-pine-dawn"),
      import("@shikijs/themes/rose-pine-moon"),
    ],
    langs: [
      import("@shikijs/langs/javascript"),
      import("@shikijs/langs/typescript"),
      import("@shikijs/langs/jsx"),
      import("@shikijs/langs/tsx"),
      import("@shikijs/langs/json"),
      import("@shikijs/langs/jsonc"),
      import("@shikijs/langs/shellscript"),
      import("@shikijs/langs/python"),
      import("@shikijs/langs/rust"),
      import("@shikijs/langs/go"),
      import("@shikijs/langs/swift"),
      import("@shikijs/langs/ruby"),
      import("@shikijs/langs/php"),
      import("@shikijs/langs/java"),
      import("@shikijs/langs/kotlin"),
      import("@shikijs/langs/c"),
      import("@shikijs/langs/cpp"),
      import("@shikijs/langs/csharp"),
      import("@shikijs/langs/css"),
      import("@shikijs/langs/scss"),
      import("@shikijs/langs/html"),
      import("@shikijs/langs/xml"),
      import("@shikijs/langs/yaml"),
      import("@shikijs/langs/toml"),
      import("@shikijs/langs/ini"),
      import("@shikijs/langs/markdown"),
      import("@shikijs/langs/diff"),
      import("@shikijs/langs/sql"),
      import("@shikijs/langs/dockerfile"),
      import("@shikijs/langs/graphql"),
      import("@shikijs/langs/lua"),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export function makeHighlight(hl: HighlighterCore, themes: ThemePair): Highlight {
  const options = { themes: { light: themes.light, dark: themes.dark }, defaultColor: false } as const;
  return (code, lang) => {
    const id = lang.trim().toLowerCase() || "text";
    try {
      return hl.codeToHtml(code, { ...options, lang: id });
    } catch {
      // Unknown language (mermaid, etc.): render as plain text instead of failing the document.
      return hl.codeToHtml(code, { ...options, lang: "text" });
    }
  };
}

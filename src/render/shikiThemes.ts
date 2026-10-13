import type { ThemeRegistrationRaw } from "@shikijs/types";
import { THEME_IDS, paletteFor, supportsMode, type Mode, type Palette, type Syntax, type ThemeId } from "../themes/catalog";

const SCOPES: Record<keyof Syntax, string[]> = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: ["keyword", "storage", "storage.type", "keyword.operator.new"],
  string: ["string", "string.quoted", "string.template"],
  number: ["constant.numeric", "constant.language", "constant.character"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  type: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.name.tag"],
};

export function shikiThemeName(id: ThemeId, mode: Mode): string {
  return `folio-${id}-${mode}`;
}

export function buildShikiTheme(id: ThemeId, mode: Mode, palette: Palette): ThemeRegistrationRaw {
  return {
    name: shikiThemeName(id, mode),
    type: mode,
    colors: { "editor.background": palette.codeBg, "editor.foreground": palette.codeFg },
    settings: [
      { settings: { foreground: palette.codeFg, background: palette.codeBg } },
      ...(Object.keys(SCOPES) as (keyof Syntax)[]).map((key) => ({
        scope: SCOPES[key],
        settings: { foreground: palette.syntax[key], ...(key === "comment" ? { fontStyle: "italic" } : {}) },
      })),
    ],
  };
}

/** Every palette as a Shiki theme, in catalog order (light before dark within a theme). */
export const FOLIO_SHIKI_THEMES: ThemeRegistrationRaw[] = THEME_IDS.flatMap((id) =>
  (["light", "dark"] as Mode[]).filter((mode) => supportsMode(id, mode)).map((mode) => buildShikiTheme(id, mode, paletteFor(id, mode))),
);

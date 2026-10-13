import { describe, expect, it } from "vitest";
import { paletteFor } from "../themes/catalog";
import { FOLIO_SHIKI_THEMES, buildShikiTheme, shikiThemeName } from "./shikiThemes";

describe("generated Shiki themes", () => {
  it("names themes by id and mode", () => {
    expect(shikiThemeName("neon-noir", "dark")).toBe("folio-neon-noir-dark");
  });

  it("generates one theme per palette", () => {
    expect(FOLIO_SHIKI_THEMES.map((t) => t.name)).toEqual([
      "folio-paper-light",
      "folio-paper-dark",
      "folio-minimal-light",
      "folio-minimal-dark",
      "folio-riso-light",
      "folio-citrus-light",
      "folio-terracotta-light",
      "folio-klein-dark",
      "folio-neon-noir-dark",
    ]);
  });

  it("carries the palette's code background, foreground, and all six syntax colors", () => {
    const palette = paletteFor("riso", "light");
    const theme = buildShikiTheme("riso", "light", palette);
    expect(theme.type).toBe("light");
    expect(theme.colors).toEqual({ "editor.background": palette.codeBg, "editor.foreground": palette.codeFg });
    const foregrounds = theme.settings.map((s) => s.settings.foreground);
    for (const color of Object.values(palette.syntax)) expect(foregrounds).toContain(color);
    expect(theme.settings[0]).toEqual({ settings: { foreground: palette.codeFg, background: palette.codeBg } });
  });

  it("italicizes comments", () => {
    const theme = buildShikiTheme("klein", "dark", paletteFor("klein", "dark"));
    const comment = theme.settings.find((s) => Array.isArray(s.scope) && s.scope.includes("comment"));
    expect(comment?.settings.fontStyle).toBe("italic");
  });
});

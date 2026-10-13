import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES, THEME_IDS, THEMES, isThemeId, paletteFor, supportsMode, themesFor, type Mode, type Palette } from "./catalog";
import { contrastRatio } from "./contrast";
import { isBundledFont } from "./fonts";

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = ["accent", "bg", "border", "codeBg", "codeFg", "fg", "heading", "highlight", "link", "linkUnderline", "muted", "quote", "selection", "syntax", "wordmarkOver", "wordmarkUnder"];
const SYNTAX_KEYS = ["comment", "function", "keyword", "number", "string", "type"];

const palettes: [string, Palette][] = THEME_IDS.flatMap((id) =>
  (["light", "dark"] as Mode[]).filter((mode) => supportsMode(id, mode)).map((mode) => [`${id}/${mode}`, paletteFor(id, mode)] as [string, Palette]),
);

describe("theme catalog", () => {
  it("has the seven themes in order", () => {
    expect(THEME_IDS).toEqual(["paper", "minimal", "riso", "citrus", "terracotta", "klein", "neon-noir"]);
  });

  it("splits themes by mode", () => {
    expect(themesFor("light")).toEqual(["paper", "minimal", "riso", "citrus", "terracotta"]);
    expect(themesFor("dark")).toEqual(["paper", "minimal", "klein", "neon-noir"]);
    expect(palettes).toHaveLength(9);
  });

  it("defaults to Riso by day and Klein by night", () => {
    expect(DEFAULT_THEMES).toEqual({ light: "riso", dark: "klein" });
    expect(supportsMode(DEFAULT_THEMES.light, "light")).toBe(true);
    expect(supportsMode(DEFAULT_THEMES.dark, "dark")).toBe(true);
  });

  it.each(palettes)("%s palette is complete hex", (_name, palette) => {
    expect(Object.keys(palette).sort()).toEqual(PALETTE_KEYS);
    expect(Object.keys(palette.syntax).sort()).toEqual(SYNTAX_KEYS);
    for (const [key, value] of Object.entries(palette)) if (key !== "syntax") expect(value, key).toMatch(HEX);
    for (const [key, value] of Object.entries(palette.syntax)) expect(value, `syntax.${key}`).toMatch(HEX);
  });

  it.each(palettes)("%s palette meets the contrast minimums", (_name, p) => {
    expect(contrastRatio(p.fg, p.bg), "fg/bg").toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.codeFg, p.codeBg), "codeFg/codeBg").toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.muted, p.bg), "muted/bg").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.link, p.bg), "link/bg").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.heading, p.bg), "heading/bg").toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.fg, p.selection), "fg/selection").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.fg, p.highlight), "fg/highlight").toBeGreaterThanOrEqual(4.5);
    expect(p.wordmarkOver, "wordmark inks differ").not.toBe(p.wordmarkUnder);
    expect(contrastRatio(p.wordmarkOver, p.bg), "wordmarkOver/bg").toBeGreaterThanOrEqual(3);
    for (const [key, color] of Object.entries(p.syntax)) {
      expect(contrastRatio(color, p.codeBg), `syntax.${key}/codeBg`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(THEME_IDS)("%s uses only bundled fonts and a valid heading style", (id) => {
    const theme = THEMES[id];
    expect(theme.id).toBe(id);
    for (const font of [theme.headingFont, theme.bodyFont, theme.codeFont]) expect(isBundledFont(font), font).toBe(true);
    expect([300, 400, 600, 700, 800, 900]).toContain(theme.heading.weight);
    expect(theme.heading.tracking).toMatch(/^-?\d*\.?\d+em$|^0$/);
    expect(["normal", "italic"]).toContain(theme.heading.style);
  });

  it("validates ids and refuses unsupported modes", () => {
    expect(isThemeId("klein")).toBe(true);
    expect(isThemeId("nord")).toBe(false);
    expect(isThemeId(3)).toBe(false);
    expect(supportsMode("klein", "light")).toBe(false);
    expect(() => paletteFor("klein", "light")).toThrow();
  });
});

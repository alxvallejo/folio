import { describe, expect, it } from "vitest";
import { DEFAULTS, applyPatch, effectiveSettings, migrate, parseConfig, serializeConfig } from "./schema";

describe("effectiveSettings", () => {
  it("returns the defaults for an empty config", () => {
    expect(effectiveSettings({})).toEqual({
      lightTheme: "riso",
      darkTheme: "klein",
      appearance: "system",
      headingFont: null,
      bodyFont: null,
      codeFont: null,
      fontSize: 18,
      lineHeight: 1.65,
      maxWidth: 68,
      editorCommand: "code",
      lastFolder: null,
      autoUpdateCheck: true,
    });
    expect(effectiveSettings({})).toEqual(DEFAULTS);
  });

  it("reads theme picks and trimmed font overrides", () => {
    expect(effectiveSettings({ lightTheme: "citrus", darkTheme: "neon-noir", headingFont: " Charter ", codeFont: "Geist Mono" })).toMatchObject({
      lightTheme: "citrus",
      darkTheme: "neon-noir",
      headingFont: "Charter",
      bodyFont: null,
      codeFont: "Geist Mono",
    });
  });

  it("falls back when a theme is unknown or picked for the wrong mode", () => {
    expect(effectiveSettings({ lightTheme: "klein", darkTheme: "riso" })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    expect(effectiveSettings({ lightTheme: "solarized", darkTheme: 7 })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    expect(effectiveSettings({ lightTheme: "paper", darkTheme: "minimal" })).toMatchObject({ lightTheme: "paper", darkTheme: "minimal" });
  });

  it("reads autoUpdateCheck only when it is a boolean", () => {
    expect(effectiveSettings({ autoUpdateCheck: false }).autoUpdateCheck).toBe(false);
    expect(effectiveSettings({ autoUpdateCheck: true }).autoUpdateCheck).toBe(true);
    expect(effectiveSettings({ autoUpdateCheck: 0 }).autoUpdateCheck).toBe(true);
  });

  it("clamps out-of-range numbers", () => {
    const s = effectiveSettings({ fontSize: 40, lineHeight: 0.5, maxWidth: 200 });
    expect([s.fontSize, s.lineHeight, s.maxWidth]).toEqual([24, 1.3, 90]);
  });

  it("ignores values of the wrong type", () => {
    expect(effectiveSettings({ appearance: "dim", fontSize: "20", bodyFont: "  ", headingFont: 3, lastFolder: 7, autoUpdateCheck: "no" })).toEqual(DEFAULTS);
  });
});

describe("migrate", () => {
  it("keeps a v1 Paper user on Paper in both modes", () => {
    expect(migrate({ theme: "paper", fontSize: 20 })).toEqual({ fontSize: 20, lightTheme: "paper", darkTheme: "paper" });
    expect(effectiveSettings({ theme: "paper" })).toMatchObject({ lightTheme: "paper", darkTheme: "paper" });
  });

  it("drops removed or unknown v1 themes so the defaults apply", () => {
    for (const theme of ["nord", "ia", "github", "catppuccin", "rose-pine", "nonsense", 3]) {
      expect(migrate({ theme, maxWidth: 70 })).toEqual({ maxWidth: 70 });
      expect(effectiveSettings({ theme })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    }
  });

  it("lets explicit new keys win over a legacy theme", () => {
    expect(migrate({ theme: "paper", lightTheme: "citrus" })).toEqual({ lightTheme: "citrus" });
  });

  it("returns a current config unchanged", () => {
    const raw = { lightTheme: "terracotta" };
    expect(migrate(raw)).toBe(raw);
  });
});

describe("applyPatch", () => {
  it("writes only keys that differ from the defaults", () => {
    expect(applyPatch({}, { fontSize: 20 })).toEqual({ fontSize: 20 });
    expect(applyPatch({ fontSize: 20 }, { fontSize: 18 })).toEqual({});
  });

  it("writes theme picks only when they differ from Riso and Klein", () => {
    expect(applyPatch({}, { lightTheme: "citrus" })).toEqual({ lightTheme: "citrus" });
    expect(applyPatch({ lightTheme: "citrus" }, { lightTheme: "riso" })).toEqual({});
    expect(applyPatch({}, { darkTheme: "neon-noir" })).toEqual({ darkTheme: "neon-noir" });
  });

  it("persists the v1 migration and drops the legacy key on the next write", () => {
    expect(applyPatch({ theme: "paper" }, { fontSize: 20 })).toEqual({ lightTheme: "paper", darkTheme: "paper", fontSize: 20 });
    expect(applyPatch({ theme: "nord" }, { fontSize: 20 })).toEqual({ fontSize: 20 });
  });

  it("clears a font override when emptied instead of writing an empty string", () => {
    expect(applyPatch({ headingFont: "Charter" }, { headingFont: "  " })).toEqual({});
    expect(applyPatch({ bodyFont: "Charter" }, { bodyFont: null })).toEqual({});
    expect(applyPatch({}, { codeFont: " Geist Mono " })).toEqual({ codeFont: "Geist Mono" });
  });

  it("clamps and rounds numeric values", () => {
    expect(applyPatch({}, { fontSize: 30, lineHeight: 1.3 + 0.05 * 7, maxWidth: 70.4 })).toEqual({ fontSize: 24, maxWidth: 70 });
  });

  it("writes autoUpdateCheck only when it is turned off", () => {
    expect(applyPatch({}, { autoUpdateCheck: false })).toEqual({ autoUpdateCheck: false });
    expect(applyPatch({ autoUpdateCheck: false }, { autoUpdateCheck: true })).toEqual({});
  });

  it("preserves unknown keys", () => {
    expect(applyPatch({ future: true }, { maxWidth: 72 })).toEqual({ future: true, maxWidth: 72 });
  });
});

describe("parse and serialize", () => {
  it("parses JSON objects", () => {
    expect(parseConfig('{"fontSize": 20}')).toEqual({ ok: true, raw: { fontSize: 20 } });
  });

  it("treats a blank file as empty config", () => {
    expect(parseConfig("  \n")).toEqual({ ok: true, raw: {} });
  });

  it("rejects invalid JSON and non-objects", () => {
    expect(parseConfig("{ broken").ok).toBe(false);
    expect(parseConfig("[1, 2]").ok).toBe(false);
    expect(parseConfig("null").ok).toBe(false);
  });

  it("serializes with two-space indent and a trailing newline", () => {
    expect(serializeConfig({ lightTheme: "citrus" })).toBe('{\n  "lightTheme": "citrus"\n}\n');
  });
});

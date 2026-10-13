import { describe, expect, it } from "vitest";
import { applyPatch, defaultsFor, effectiveSettings, parseConfig, serializeConfig } from "./schema";

describe("effectiveSettings", () => {
  it("returns preset defaults for an empty config", () => {
    expect(effectiveSettings({})).toEqual({
      theme: "paper",
      appearance: "system",
      bodyFont: "Literata",
      codeFont: "JetBrains Mono",
      fontSize: 18,
      lineHeight: 1.65,
      maxWidth: 68,
      editorCommand: "code",
      lastFolder: null,
    });
  });

  it("takes font defaults from the configured preset", () => {
    const s = effectiveSettings({ theme: "catppuccin" });
    expect([s.bodyFont, s.codeFont]).toEqual(["Inter", "JetBrains Mono"]);
  });

  it("lets overrides win over preset defaults", () => {
    expect(effectiveSettings({ theme: "nord", bodyFont: "Charter" }).bodyFont).toBe("Charter");
  });

  it("clamps out-of-range numbers", () => {
    const s = effectiveSettings({ fontSize: 40, lineHeight: 0.5, maxWidth: 200 });
    expect([s.fontSize, s.lineHeight, s.maxWidth]).toEqual([24, 1.3, 90]);
  });

  it("ignores values of the wrong type", () => {
    const s = effectiveSettings({ theme: "solarized", appearance: "dim", fontSize: "20", bodyFont: "  ", lastFolder: 7 });
    expect(s).toEqual(defaultsFor("paper"));
  });
});

describe("applyPatch", () => {
  it("writes only keys that differ from the defaults", () => {
    expect(applyPatch({}, { fontSize: 20 })).toEqual({ fontSize: 20 });
    expect(applyPatch({ fontSize: 20 }, { fontSize: 18 })).toEqual({});
  });

  it("writes theme only when it is not paper", () => {
    expect(applyPatch({}, { theme: "nord" })).toEqual({ theme: "nord" });
    expect(applyPatch({ theme: "nord" }, { theme: "paper" })).toEqual({});
  });

  it("never turns the old preset's fonts into overrides when switching theme", () => {
    const raw = applyPatch({}, { theme: "catppuccin" });
    expect(raw).toEqual({ theme: "catppuccin" });
    expect(effectiveSettings(raw).bodyFont).toBe("Inter");
  });

  it("drops a font override that matches the current preset default", () => {
    expect(applyPatch({ theme: "nord", bodyFont: "Charter" }, { bodyFont: "Source Serif 4" })).toEqual({ theme: "nord" });
  });

  it("clamps and rounds numeric values", () => {
    expect(applyPatch({}, { fontSize: 30, lineHeight: 1.3 + 0.05 * 7, maxWidth: 70.4 })).toEqual({ fontSize: 24, maxWidth: 70 });
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
    expect(serializeConfig({ theme: "nord" })).toBe('{\n  "theme": "nord"\n}\n');
  });
});

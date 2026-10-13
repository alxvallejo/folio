import { describe, expect, it } from "vitest";
import { SHIKI_THEMES } from "../render/highlight";
import { applyTheme, resolveAppearance, themeVariables } from "./apply";
import { BODY_FONTS, CODE_FONTS, fontStack } from "./fonts";
import { PRESET_IDS, PRESETS, isPresetId } from "./presets";

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = ["accent", "bg", "border", "codeBg", "codeFg", "fg", "muted", "selection"];

describe("presets", () => {
  it("has the six presets with paper first", () => {
    expect(PRESET_IDS).toEqual(["paper", "ia", "github", "catppuccin", "nord", "rose-pine"]);
  });

  it("defines complete light and dark palettes", () => {
    for (const id of PRESET_IDS) {
      for (const variant of ["light", "dark"] as const) {
        const palette = PRESETS[id][variant];
        expect(Object.keys(palette).sort(), `${id}.${variant}`).toEqual(PALETTE_KEYS);
        for (const [key, value] of Object.entries(palette)) expect(value, `${id}.${variant}.${key}`).toMatch(HEX);
      }
    }
  });

  it("pairs every preset with loaded Shiki themes", () => {
    for (const id of PRESET_IDS) {
      expect(SHIKI_THEMES).toContain(PRESETS[id].shiki.light);
      expect(SHIKI_THEMES).toContain(PRESETS[id].shiki.dark);
    }
  });

  it("defaults only to registered fonts", () => {
    for (const id of PRESET_IDS) {
      expect(BODY_FONTS.map((f) => f.label)).toContain(PRESETS[id].bodyFont);
      expect(CODE_FONTS.map((f) => f.label)).toContain(PRESETS[id].codeFont);
    }
  });

  it("keeps Nord code blocks dark on the light page", () => {
    expect(PRESETS.nord.shiki).toEqual({ light: "nord", dark: "nord" });
    expect(PRESETS.nord.light.codeBg).toBe("#2e3440");
  });

  it("keeps code text distinguishable from the code background", () => {
    for (const id of PRESET_IDS) {
      for (const variant of ["light", "dark"] as const) {
        const palette = PRESETS[id][variant];
        expect(palette.codeFg, `${id}.${variant}`).not.toBe(palette.codeBg);
      }
    }
  });

  it("validates preset ids", () => {
    expect(isPresetId("nord")).toBe(true);
    expect(isPresetId("solarized")).toBe(false);
    expect(isPresetId(3)).toBe(false);
  });
});

describe("fontStack", () => {
  it("maps registered labels case-insensitively", () => {
    expect(fontStack("literata", "body")).toBe(BODY_FONTS.find((f) => f.label === "Literata")!.stack);
  });

  it("quotes any installed family with a sensible fallback", () => {
    expect(fontStack("Charter", "body")).toBe('"Charter", system-ui, sans-serif');
    expect(fontStack("Berkeley Mono", "code")).toBe('"Berkeley Mono", ui-monospace, monospace');
  });

  it("strips characters that could break out of the CSS value", () => {
    expect(fontStack('Evil"; color: red; {', "body")).toBe('"Evil color: red", system-ui, sans-serif');
    expect(fontStack("  ", "code")).toBe("ui-monospace, monospace");
  });
});

describe("apply", () => {
  const input = { theme: "paper" as const, bodyFont: "Literata", codeFont: "JetBrains Mono", fontSize: 18, lineHeight: 1.65, maxWidth: 68 };

  it("resolves appearance", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });

  it("maps settings onto CSS custom properties", () => {
    const vars = themeVariables(input, "dark");
    expect(vars["--bg"]).toBe(PRESETS.paper.dark.bg);
    expect(vars["--code-bg"]).toBe(PRESETS.paper.dark.codeBg);
    expect(vars["--code-fg"]).toBe(PRESETS.paper.dark.codeFg);
    expect(vars["--font-size"]).toBe("18px");
    expect(vars["--line-height"]).toBe("1.65");
    expect(vars["--max-width"]).toBe("68ch");
    expect(vars["--font-body"]).toContain("Literata");
    expect(vars["--font-code"]).toContain("JetBrains Mono");
  });

  it("writes variables and data attributes onto the root", () => {
    const root = document.documentElement;
    applyTheme(root, { ...input, theme: "nord" }, "light");
    expect(root.style.getPropertyValue("--bg")).toBe(PRESETS.nord.light.bg);
    expect(root.dataset.appearance).toBe("light");
    expect(root.dataset.theme).toBe("nord");
  });
});

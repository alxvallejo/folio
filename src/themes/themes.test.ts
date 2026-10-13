import { describe, expect, it } from "vitest";
import { activeTheme, applyTheme, resolveAppearance, themeVariables } from "./apply";
import { paletteFor } from "./catalog";
import { BODY_FONTS, HEADING_FONTS, fontStack, fontSuggestions, isBundledFont } from "./fonts";

describe("fontStack", () => {
  it("maps registered labels case-insensitively", () => {
    expect(fontStack("literata", "body")).toBe(BODY_FONTS.find((f) => f.label === "Literata")!.stack);
    expect(fontStack("Fraunces", "heading")).toBe(HEADING_FONTS.find((f) => f.label === "Fraunces")!.stack);
  });

  it("quotes any installed family with a sensible fallback", () => {
    expect(fontStack("Charter", "body")).toBe('"Charter", system-ui, sans-serif');
    expect(fontStack("Charter", "heading")).toBe('"Charter", system-ui, sans-serif');
    expect(fontStack("Berkeley Mono", "code")).toBe('"Berkeley Mono", ui-monospace, monospace');
  });

  it("strips characters that could break out of the CSS value", () => {
    expect(fontStack('Evil"; color: red; {', "body")).toBe('"Evil color: red", system-ui, sans-serif');
    expect(fontStack("  ", "code")).toBe("ui-monospace, monospace");
  });
});

describe("font registry", () => {
  it("knows which fonts are bundled", () => {
    expect(isBundledFont("Geist")).toBe(true);
    expect(isBundledFont("Comic Sans")).toBe(false);
  });

  it("offers display and body fonts for headings", () => {
    expect(fontSuggestions("heading")).toEqual(expect.arrayContaining(["Fraunces", "Instrument Serif", "Literata"]));
    expect(fontSuggestions("code")).toContain("Geist Mono");
  });
});

describe("apply", () => {
  const input = {
    lightTheme: "riso" as const,
    darkTheme: "klein" as const,
    headingFont: null,
    bodyFont: null,
    codeFont: null,
    fontSize: 18,
    lineHeight: 1.65,
    maxWidth: 68,
  };

  it("resolves appearance", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });

  it("shows the light pick by day and the dark pick by night", () => {
    expect(activeTheme(input, "light")).toBe("riso");
    expect(activeTheme(input, "dark")).toBe("klein");
  });

  it("maps the active theme onto CSS custom properties", () => {
    const vars = themeVariables(input, "dark");
    const p = paletteFor("klein", "dark");
    expect(vars).toMatchObject({
      "--bg": p.bg,
      "--fg": p.fg,
      "--heading": p.heading,
      "--link": p.link,
      "--link-underline": p.linkUnderline,
      "--accent": p.accent,
      "--highlight": p.highlight,
      "--quote": p.quote,
      "--wordmark-over": "#f3f1ea",
      "--wordmark-under": "#ffd23f",
      "--code-bg": p.codeBg,
      "--code-fg": p.codeFg,
      "--heading-weight": "400",
      "--heading-tracking": "0",
      "--heading-style": "italic",
      "--font-size": "18px",
      "--line-height": "1.65",
      "--max-width": "68ch",
    });
    expect(vars["--font-heading"]).toContain("Instrument Serif");
    expect(vars["--font-body"]).toContain("Inter");
    expect(vars["--font-code"]).toContain("JetBrains Mono");
  });

  it("lets font overrides win over the theme's fonts", () => {
    const vars = themeVariables({ ...input, headingFont: "Charter", bodyFont: "Geist", codeFont: "Geist Mono" }, "light");
    expect(vars["--font-heading"]).toBe('"Charter", system-ui, sans-serif');
    expect(vars["--font-body"]).toContain("Geist Variable");
    expect(vars["--font-code"]).toContain("Geist Mono Variable");
  });

  it("writes variables and data attributes onto the root", () => {
    const root = document.documentElement;
    applyTheme(root, input, "light");
    expect(root.style.getPropertyValue("--bg")).toBe(paletteFor("riso", "light").bg);
    expect(root.dataset.appearance).toBe("light");
    expect(root.dataset.theme).toBe("riso");
  });
});

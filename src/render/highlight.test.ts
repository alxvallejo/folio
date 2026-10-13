import type { HighlighterCore } from "shiki/core";
import { beforeAll, describe, expect, it } from "vitest";
import { getHighlighter, makeHighlight } from "./highlight";
import { FOLIO_SHIKI_THEMES } from "./shikiThemes";

let hl: HighlighterCore;
beforeAll(async () => {
  hl = await getHighlighter();
});

const highlight = () => makeHighlight(hl, { light: "folio-riso-light", dark: "folio-klein-dark" });
const tokenCount = (html: string) => (html.match(/--shiki-light:/g) ?? []).length;

describe("highlight", () => {
  it("loads every preset theme", () => {
    expect(hl.getLoadedThemes()).toEqual(expect.arrayContaining(FOLIO_SHIKI_THEMES.map((t) => t.name)));
  });

  it("emits dual-theme CSS variables without inline colors", () => {
    const html = highlight()("const x: number = 1;", "typescript");
    expect(html).toContain('class="shiki');
    expect(html).toContain("--shiki-dark:");
    expect(html).not.toMatch(/(^|[;"\s])color:/);
  });

  it("colors tokens from the active palettes", () => {
    const html = highlight()("const x = 1;", "typescript");
    expect(html).toMatch(/--shiki-light:#ff8a80/i); // riso keyword
    expect(html).toMatch(/--shiki-dark:#ffd23f/i); // klein keyword
  });

  it("resolves language aliases", () => {
    expect(tokenCount(highlight()("const x = 1;", "ts"))).toBeGreaterThan(2);
    expect(tokenCount(highlight()("echo $HOME | grep x", "sh"))).toBeGreaterThan(1);
  });

  it("falls back to plain text for unknown languages", () => {
    const run = () => highlight()("graph TD; A-->B", "mermaid");
    expect(run).not.toThrow();
    expect(run()).toContain("graph TD");
  });

  it("falls back to plain text for an empty info string", () => {
    expect(() => highlight()("plain", "")).not.toThrow();
  });

  it("escapes HTML inside code", () => {
    expect(highlight()("<script>alert(1)</script>", "text")).not.toContain("<script>");
  });
});

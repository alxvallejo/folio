import type { HighlighterCore } from "shiki/core";
import { beforeAll, describe, expect, it } from "vitest";
import { SHIKI_THEMES, getHighlighter, makeHighlight } from "./highlight";

let hl: HighlighterCore;
beforeAll(async () => {
  hl = await getHighlighter();
});

const highlight = () => makeHighlight(hl, { light: "github-light", dark: "github-dark" });
const tokenCount = (html: string) => (html.match(/--shiki-light:/g) ?? []).length;

describe("highlight", () => {
  it("loads every preset theme", () => {
    expect(hl.getLoadedThemes()).toEqual(expect.arrayContaining([...SHIKI_THEMES]));
  });

  it("emits dual-theme CSS variables without inline colors", () => {
    const html = highlight()("const x: number = 1;", "typescript");
    expect(html).toContain('class="shiki');
    expect(html).toContain("--shiki-dark:");
    expect(html).not.toMatch(/(^|[;"\s])color:/);
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

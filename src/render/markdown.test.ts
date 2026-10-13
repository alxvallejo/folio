import { describe, expect, it } from "vitest";
import { createMarkdown, type RenderEnv } from "./markdown";

const md = createMarkdown();

function render(source: string) {
  const env: RenderEnv = {};
  const html = md.render(source, env);
  return { html, headings: env.headings ?? [] };
}

describe("createMarkdown", () => {
  it("gives headings GitHub-style ids", () => {
    expect(render("# Hello, World!").html).toContain('<h1 id="hello-world">');
  });

  it("dedupes repeated headings like GitHub", () => {
    const { headings } = render("## Setup\n\n## Setup\n\n## Setup");
    expect(headings.map((h) => h.id)).toEqual(["setup", "setup-1", "setup-2"]);
  });

  it("uses the visible text of inline code and links", () => {
    const { headings } = render("## The `render()` [API](x.md)");
    expect(headings[0]).toEqual({ level: 2, text: "The render() API", id: "the-render-api" });
  });

  it("collects H1–H4 for the TOC but gives every level an id", () => {
    const { html, headings } = render("# One\n\n#### Four\n\n##### Five");
    expect(headings.map((h) => h.level)).toEqual([1, 4]);
    expect(html).toContain('<h5 id="five">');
  });

  it("starts slug numbering fresh on every render", () => {
    expect(render("# A").headings[0].id).toBe("a");
    expect(render("# A").headings[0].id).toBe("a");
  });

  it("renders GFM features", () => {
    const { html } = render(
      [
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "~~gone~~ https://example.com",
        "",
        "- [ ] todo",
        "- [x] done",
        "",
        "Note.[^1]",
        "",
        "[^1]: Footnote.",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<s>gone</s>");
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toMatch(/<input class="task-list-item-checkbox"[^>]*disabled/);
    expect(html).toContain('class="footnotes"');
  });

  it("passes fenced code to the highlighter with its language", () => {
    const seen: string[] = [];
    const withHighlight = createMarkdown((code, lang) => {
      seen.push(`${lang}:${code}`);
      return `<pre class="hl">${code}</pre>`;
    });
    const html = withHighlight.render("```ts\nlet x\n```", {});
    expect(seen).toEqual(["ts:let x\n"]);
    expect(html).toContain('<pre class="hl">');
  });
});

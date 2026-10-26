import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/gfm.md?raw";
import { createRenderer, type Render } from "./index";

const toAssetUrl = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;
const themes = { light: "folio-riso-light", dark: "folio-klein-dark" };

let render: Render;
beforeAll(async () => {
  render = await createRenderer();
});

const html = (source: string, baseDir = "/notes") => render(source, { baseDir, themes, toAssetUrl }).html;

function dom(markup: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content;
}

describe("sanitizing", () => {
  it("strips scripts, handlers, and javascript: URLs", () => {
    const out = html(
      '<script>alert(1)</script>\n\n<img src="https://x.test/a.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>',
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("javascript:");
  });

  it("keeps details, summary, and kbd", () => {
    const out = html("<details><summary>More</summary>\n\nPress <kbd>K</kbd>\n\n</details>");
    expect(out).toContain("<details>");
    expect(out).toContain("<summary>More</summary>");
    expect(out).toContain("<kbd>K</kbd>");
  });

  it("keeps heading ids that collide with DOM properties", () => {
    const out = dom(html("# Links\n\n## Images\n\n### Title\n\n#### Forms"));
    for (const id of ["links", "images", "title", "forms"]) {
      expect(out.querySelector(`[id="${id}"]`), id).not.toBeNull();
    }
  });

  it("strips forms", () => {
    const out = html('<form action="https://evil.test"><button>go</button></form>');
    expect(out).not.toContain("<form");
    expect(out).not.toContain("evil.test");
  });

  it("strips image maps", () => {
    const out = html('<map name="m"><area href="https://evil.test" shape="rect" coords="0,0,1,1"></map>');
    expect(out).not.toContain("<area");
    expect(out).not.toContain("evil.test");
  });

  it("strips SVG xlink:href links", () => {
    expect(html('<svg><a xlink:href="https://evil.test"><text>x</text></a></svg>')).not.toContain("evil.test");
  });

  it("strips dialog and popover", () => {
    const out = html("<dialog open>x</dialog>\n\n<div popover>y</div>");
    expect(out).not.toContain("<dialog");
    expect(out).not.toContain("popover");
  });

  it("strips style blocks that could restyle the app", () => {
    const out = html("text\n\n<style>body{display:none}</style>");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("display:none");
  });

  it("drops name attributes, which can shadow document properties", () => {
    expect(html('<img name="cookie" src="https://x.test/a.png">')).not.toContain("name=");
  });
});

describe("images", () => {
  it("rewrites relative images to asset URLs", () => {
    const out = dom(html("![a](images/diagram.png)\n\n![b](../shared/x.png)"));
    const [a, b] = out.querySelectorAll("img");
    expect(a.getAttribute("src")).toBe(toAssetUrl("/notes/images/diagram.png"));
    expect(b.getAttribute("src")).toBe(toAssetUrl("/shared/x.png"));
  });

  it("decodes percent-encoded relative paths before resolving", () => {
    const out = dom(html("![a](my%20diagram.png)\n\n![b](100%25.png)\n\n![c](café.png)"));
    const srcs = [...out.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual([
      toAssetUrl("/notes/my diagram.png"),
      toAssetUrl("/notes/100%.png"),
      toAssetUrl("/notes/café.png"),
    ]);
  });

  it("rewrites relative srcset on picture sources and images", () => {
    const out = dom(
      html('<picture><source srcset="dark.png" media="(prefers-color-scheme: dark)"><img src="light.png"></picture>'),
    );
    expect(out.querySelector("source")!.getAttribute("srcset")).toBe(toAssetUrl("/notes/dark.png"));
    expect(out.querySelector("img")!.getAttribute("src")).toBe(toAssetUrl("/notes/light.png"));
  });

  it("rewrites only relative srcset candidates and keeps descriptors", () => {
    const out = dom(html('<img src="a.png" srcset="a.png 1x, https://x.test/b.png 2x">'));
    expect(out.querySelector("img")!.getAttribute("srcset")).toBe(`${toAssetUrl("/notes/a.png")} 1x, https://x.test/b.png 2x`);
  });

  it("leaves remote and data images alone", () => {
    const out = dom(html("![r](https://example.com/a.png)\n\n![d](data:image/png;base64,iVBORw0KGgo=)"));
    const srcs = [...out.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["https://example.com/a.png", "data:image/png;base64,iVBORw0KGgo="]);
  });
});

describe("links", () => {
  const links = (source: string) => [...dom(html(source)).querySelectorAll("a")].map((a) => ({ ...a.dataset }));

  it("marks Markdown links for in-app navigation with their fragment", () => {
    expect(links("[a](../plans/next.md#setup)")).toEqual([{ folioMd: "/plans/next.md", folioFragment: "setup" }]);
  });

  it("decodes percent-encoded relative paths in Markdown links", () => {
    expect(links("[n](<My Notes.md>)")).toEqual([{ folioMd: "/notes/My Notes.md" }]);
  });

  it("marks fragment-only, external, and other-file links", () => {
    expect(links("[a](#intro) [b](https://x.com) [c](mailto:a@b.co) [d](diagram.pdf)")).toEqual([
      { folioAnchor: "intro" },
      { folioExternal: "" },
      { folioExternal: "" },
      { folioFile: "/notes/diagram.pdf" },
    ]);
  });
});

describe("createRenderer", () => {
  it("returns headings alongside html", () => {
    const result = render("# One\n\n## Two", { baseDir: "/", themes, toAssetUrl });
    expect(result.headings).toEqual([
      { level: 1, text: "One", id: "one" },
      { level: 2, text: "Two", id: "two" },
    ]);
  });

  it("hides frontmatter", () => {
    const out = html("---\nstatus: draft\n---\n\n# Hi\n");
    expect(out).toContain("<h1");
    expect(out).not.toContain("status");
    expect(html("---\nIntro\n---\n")).toContain("Intro");
  });

  it("renders the GFM fixture", async () => {
    await expect(html(fixture, "/specs")).toMatchFileSnapshot("./__snapshots__/gfm.html");
  });
});

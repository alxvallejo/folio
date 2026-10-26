import { describe, expect, it } from "vitest";
import { copyMessage, toSubstack } from "./substack";

describe("toSubstack", () => {
  it("drops frontmatter and the title, keeps formatting and links", () => {
    const r = toSubstack("---\nstatus: draft\n---\n\n# Slow software\n\nA **bold** [link](https://a.b).\n\n## Why\n");
    expect(r.droppedTitle).toBe(true);
    expect(r.html).not.toContain("Slow software");
    expect(r.html).toContain("<strong>bold</strong>");
    expect(r.html).toContain('<a href="https://a.b">link</a>');
    expect(r.html).toContain("<h2>Why</h2>"); // no id attribute
    expect(r.text.startsWith("A **bold**")).toBe(true);
  });
  it("keeps a post without a top heading whole", () => expect(toSubstack("Hello").droppedTitle).toBe(false));
  it("drops local images only", () => {
    const r = toSubstack("![a](pic.png) ![b](https://x.y/b.png)");
    expect(r.droppedImages).toBe(1);
    expect(r.html).toContain("https://x.y/b.png");
    expect(r.html).not.toContain("pic.png");
  });
  it("unwraps links that aren't web or mail links, keeping their text", () => {
    const { html } = toSubstack("See [notes](./notes.md), [top](#top), [web](https://a.b) and [mail](mailto:a@b.co).");
    expect(html.trim()).toBe('<p>See notes, top, <a href="https://a.b">web</a> and <a href="mailto:a@b.co">mail</a>.</p>');
  });
  it("renders code blocks plainly", () => expect(toSubstack("```js\nx\n```").html).toContain("<pre><code>x\n</code></pre>"));
  it("handles a CRLF post", () => {
    const r = toSubstack("---\r\nstatus: draft\r\n---\r\n\r\n# T\r\n\r\nBody\r\n");
    expect(r.droppedTitle).toBe(true);
    expect(r.text.startsWith("Body")).toBe(true);
  });
});

describe("copyMessage", () => {
  it("words the toast", () => {
    expect(copyMessage({ droppedTitle: true, droppedImages: 0 } as never)).toBe("Copied for Substack (title left out).");
    expect(copyMessage({ droppedTitle: false, droppedImages: 2 } as never)).toBe("Copied for Substack. Left out 2 local images.");
    expect(copyMessage({ droppedTitle: true, droppedImages: 1 } as never)).toBe("Copied for Substack (title left out). Left out 1 local image.");
  });
});

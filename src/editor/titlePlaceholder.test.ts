import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { emptyTitleEnd } from "./titlePlaceholder";

const end = (doc: string) => emptyTitleEnd(EditorState.create({ doc }));

describe("emptyTitleEnd", () => {
  it("finds a new post's empty heading past the frontmatter", () => {
    const doc = "---\nstatus: draft\n---\n\n# \n";
    expect(end(doc)).toBe(doc.length - 1);
    expect(end("#")).toBe(1);
  });

  it("is null once the title has text, or when the first line isn't a heading", () => {
    expect(end("---\nstatus: draft\n---\n\n# Hello\n")).toBeNull();
    expect(end("Intro\n# \n")).toBeNull();
    expect(end("## \n")).toBeNull();
    expect(end("")).toBeNull();
  });
});

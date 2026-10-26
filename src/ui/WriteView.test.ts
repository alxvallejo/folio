import { undo } from "@codemirror/commands";
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveState } from "../editor/autosave";
import { api } from "../lib/api";
import { WriteView, type WriterHandle } from "./WriteView";

vi.mock("../lib/api", () => ({ api: { writePost: vi.fn(async () => {}) } }));
const writePost = vi.mocked(api.writePost);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout; CodeMirror measures text ranges.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const PATH = "/u/Blog/Slow software.md";
const CRLF_POST = "---\r\nstatus: draft\r\n---\r\n\r\n# Slow software\r\n\r\nBody\r\n";

let root: Root;
let container: HTMLDivElement;
let handle: ReturnType<typeof createRef<WriterHandle | null>>;
let states: SaveState[];
let notify: ReturnType<typeof vi.fn<(m: string) => void>>;

function render(diskText: string, removed = false) {
  act(() =>
    root.render(
      createElement(WriteView, {
        key: PATH,
        path: PATH,
        diskText,
        removed,
        onState: (s) => states.push(s),
        onHeadings: () => {},
        onActiveHeading: () => {},
        handleRef: handle,
        notify,
      }),
    ),
  );
}

const writer = () => handle.current!;
/** Types at the end of the line holding `after`. */
function type(text: string, after = "Body") {
  const view = writer().view;
  const at = view.state.doc.toString().indexOf(after) + after.length;
  act(() => view.dispatch({ changes: { from: at, insert: text }, userEvent: "input.type" }));
}
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const banner = () => container.querySelector(".conflict-banner");
const click = (label: string) =>
  act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!.click());

beforeEach(() => {
  vi.useFakeTimers();
  writePost.mockReset();
  writePost.mockImplementation(async () => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  handle = createRef<WriterHandle | null>() as typeof handle;
  states = [];
  notify = vi.fn<(m: string) => void>();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("WriteView", () => {
  it("starts on the line after the title", () => {
    render(CRLF_POST);
    const { state } = writer().view;
    expect(state.doc.lineAt(state.selection.main.head).number).toBe(state.doc.lineAt(state.doc.toString().indexOf("# Slow")).number + 1);
  });

  it("autosaves a CRLF post with its line endings, and saves nothing when untouched", async () => {
    render(CRLF_POST);
    await advance(2000);
    expect(writePost).not.toHaveBeenCalled();
    type("!");
    await advance(1000);
    expect(writePost).toHaveBeenCalledWith(PATH, CRLF_POST.replace("Body", "Body!"));
    expect(states[states.length - 1]).toBe("saved");
  });

  it("ignores the watcher echo of its own save", async () => {
    render(CRLF_POST);
    type("!");
    await advance(1000);
    type(" more", "Body!");
    render(CRLF_POST.replace("Body", "Body!"));
    expect(banner()).toBeNull();
    expect(writer().text()).toBe(CRLF_POST.replace("Body", "Body! more"));
  });

  it("reloads an outside change when everything is saved, without saving it back", async () => {
    render(CRLF_POST);
    const outside = CRLF_POST.replace("Body", "Body from VS Code");
    render(outside);
    expect(writer().text()).toBe(outside);
    expect(banner()).toBeNull();
    await advance(2000);
    expect(writePost).not.toHaveBeenCalled();
  });

  it("asks on an outside change over unsaved edits; Use the disk version takes it", async () => {
    render(CRLF_POST);
    type(" mine");
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    expect(banner()?.textContent).toContain("This post changed on disk.");
    expect(writer().text()).toContain("Body mine");
    click("Use the disk version");
    await advance(2000);
    expect(writer().text()).toBe(outside);
    expect(banner()).toBeNull();
    expect(writePost).not.toHaveBeenCalled();
    // Alex's text is one undo away.
    act(() => void undo(writer().view));
    expect(writer().text()).toContain("Body mine");
  });

  it("Keep mine writes the editor text over the disk version", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    click("Keep mine");
    await advance(0);
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Body mine"));
    expect(banner()).toBeNull();
  });

  it("keeps the disk version the banner offered even after autosave overwrote the file", async () => {
    render(CRLF_POST);
    type(" mine");
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    await advance(1000); // autosave writes Alex's text over the disk version
    render(CRLF_POST.replace("Body", "Body mine")); // its watcher echo
    click("Use the disk version");
    await advance(0);
    expect(writer().text()).toBe(outside);
  });

  it("writes the disk version back when a save in flight lands after Use the disk version", async () => {
    let finish!: () => void;
    render(CRLF_POST);
    type(" mine");
    writePost.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await advance(1000); // the save starts and hangs
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    click("Use the disk version");
    await act(async () => finish());
    await advance(0);
    expect(writePost).toHaveBeenLastCalledWith(PATH, outside);
    expect(writer().text()).toBe(outside);
  });

  it("replace() is one undoable step that keeps CRLF", () => {
    render(CRLF_POST);
    const next = CRLF_POST.replace("status: draft", "status: published\r\npublished: 2026-10-26");
    act(() => writer().replace(next));
    expect(writer().text()).toBe(next);
    act(() => void undo(writer().view));
    expect(writer().text()).toBe(CRLF_POST);
  });

  it("saves pending text to its own post when it closes", async () => {
    render(CRLF_POST);
    type("!");
    act(() => root.unmount());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(writePost).toHaveBeenCalledWith(PATH, CRLF_POST.replace("Body", "Body!"));
    root = createRoot(container); // for afterEach
  });

  it("doesn't write while the file is missing, and shows it isn't saved", async () => {
    render(CRLF_POST, true);
    expect(container.textContent).toContain("File no longer exists");
    type("!");
    await advance(1000);
    expect(writePost).not.toHaveBeenCalled();
    expect(states[states.length - 1]).toBe("error");
    await expect(writer().flush()).rejects.toThrow();
  });
});

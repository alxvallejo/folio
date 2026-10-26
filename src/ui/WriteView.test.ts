import { undo } from "@codemirror/commands";
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveState } from "../editor/autosave";
import { api } from "../lib/api";
import { WriteView, type WriterHandle } from "./WriteView";

vi.mock("../lib/api", () => ({ api: { writePost: vi.fn(async () => {}), renamePost: vi.fn() } }));
const writePost = vi.mocked(api.writePost);
const renamePost = vi.mocked(api.renamePost);

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
let renamed: [string, string][];

function render(diskText: string, removed = false, path = PATH) {
  act(() =>
    root.render(
      createElement(WriteView, {
        key: "post",
        path,
        diskText,
        removed,
        onState: (s) => states.push(s),
        onHeadings: () => {},
        onStatus: () => {},
        onActiveHeading: () => {},
        onRenamed: (from, to) => renamed.push([from, to]),
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
  renamePost.mockReset();
  renamePost.mockImplementation(async (_path: string, _from: string, title: string) => `/u/Blog/${title}.md`);
  renamed = [];
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
    // The disk already holds the outside version and Alex's text never went there.
    expect(writePost).not.toHaveBeenCalled();
    expect(states[states.length - 1]).toBe("saved");
    // Alex's text is one undo away.
    act(() => void undo(writer().view));
    expect(writer().text()).toContain("Body mine");
  });

  it("Keep mine writes the editor text over the disk version", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    await advance(2000);
    expect(writePost).not.toHaveBeenCalled();
    click("Keep mine");
    await advance(0);
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Body mine"));
    expect(banner()).toBeNull();
  });

  it("holds saves while the banner is up, so the outside version stays on disk", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    type(" and more", "Body mine");
    await advance(2000);
    expect(writePost).not.toHaveBeenCalled();
    expect(states[states.length - 1]).toBe("error"); // the title says "not saved"
    act(() => window.dispatchEvent(new Event("blur")));
    await advance(0);
    expect(writePost).not.toHaveBeenCalled();
  });

  it("Use the disk version after the hold has run for a while writes the disk version", async () => {
    render(CRLF_POST);
    type(" mine");
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    await advance(2000);
    click("Use the disk version");
    await advance(2000);
    expect(writer().text()).toBe(outside);
    expect(writePost).not.toHaveBeenCalled(); // the disk still holds the outside version
    expect(states[states.length - 1]).toBe("saved");
  });

  it("leaving with the banner up keeps Alex's text, like Keep mine", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    await act(() => writer().flush()); // what leavePost does before switching files
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Body mine"));
    writePost.mockClear();
    type(" again", "Body mine");
    act(() => root.unmount()); // any other way out: dispose
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Body mine again"));
    root = createRoot(container); // for afterEach
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

  it("after undoing back to the last save, a second outside change updates the banner and nothing is lost", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    act(() => void undo(writer().view));
    expect(writer().text()).toBe(CRLF_POST);
    await advance(2000);
    expect(writePost).not.toHaveBeenCalled();
    expect(states[states.length - 1]).toBe("error"); // Alex's text isn't what's on disk
    const second = CRLF_POST.replace("Body", "Theirs, edited");
    render(second);
    expect(banner()).not.toBeNull();
    click("Use the disk version");
    await advance(2000);
    expect(writer().text()).toBe(second);
    expect(writePost).not.toHaveBeenCalled();
  });

  it("after undoing back to the last save, leaving writes Alex's text", async () => {
    render(CRLF_POST);
    type(" mine");
    render(CRLF_POST.replace("Body", "Theirs"));
    act(() => void undo(writer().view));
    await act(() => writer().flush());
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST);
  });

  it("reloads a newer outside change once Alex's save has landed, and saves again after", async () => {
    let finish!: () => void;
    render(CRLF_POST);
    type(" mine");
    writePost.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    await advance(1000); // Alex's save starts and hangs
    render(CRLF_POST.replace("Body", "Theirs"));
    expect(banner()).not.toBeNull();
    await act(async () => finish()); // it lands: Alex's text is on disk
    const second = CRLF_POST.replace("Body", "Theirs again");
    render(second);
    expect(writer().text()).toBe(second);
    expect(banner()).toBeNull();
    type(" plus", "Theirs again");
    await advance(1000);
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Theirs again plus"));
  });

  it("keeps what Alex types while Use the disk version is writing", async () => {
    const finish: (() => void)[] = [];
    const hang = () => new Promise<void>((resolve) => finish.push(resolve));
    render(CRLF_POST);
    type(" mine");
    writePost.mockImplementationOnce(hang).mockImplementationOnce(hang);
    await advance(1000); // Alex's save starts and hangs
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    click("Use the disk version");
    await act(async () => finish[0]()); // Alex's save lands; writing the disk version back starts
    expect(writePost).toHaveBeenLastCalledWith(PATH, outside);
    type(" new", "Theirs"); // typed while that write is in flight
    await act(async () => finish[1]());
    await advance(1000);
    expect(writer().text()).toBe(CRLF_POST.replace("Body", "Theirs new"));
    expect(writePost).toHaveBeenLastCalledWith(PATH, CRLF_POST.replace("Body", "Theirs new"));
    expect(states[states.length - 1]).toBe("saved");
  });

  it("closes the link box when an outside change reloads the post", () => {
    render(CRLF_POST);
    const view = writer().view;
    // Mod is Ctrl outside macOS, and jsdom isn't macOS.
    act(() => void view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(container.querySelector(".link-box")).not.toBeNull();
    const outside = CRLF_POST.replace("Body", "Theirs");
    render(outside);
    expect(writer().text()).toBe(outside);
    expect(container.querySelector(".link-box")).toBeNull();
  });

  describe("file name follows the title", () => {
    const NEW_POST = "---\nstatus: draft\n---\n\n# \n";
    const UNTITLED = "/u/Blog/Untitled.md";

    it("starts a new post in its empty title and renames it on Enter", async () => {
      render(NEW_POST, false, UNTITLED);
      const view = writer().view;
      expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("# ");
      act(() => view.dispatch(view.state.replaceSelection("Slow software"), { userEvent: "input.type" }));
      await advance(300);
      expect(renamePost).not.toHaveBeenCalled();
      act(() => view.dispatch(view.state.replaceSelection("\n"), { userEvent: "input" }));
      await advance(0);
      expect(writePost).toHaveBeenCalledWith(UNTITLED, "---\nstatus: draft\n---\n\n# Slow software\n\n");
      expect(renamePost).toHaveBeenCalledWith(UNTITLED, "", "Slow software");
      expect(renamed).toEqual([[UNTITLED, "/u/Blog/Slow software.md"]]);
      act(() => view.dispatch(view.state.replaceSelection("Body"), { userEvent: "input.type" }));
      await advance(1000);
      expect(writePost).toHaveBeenLastCalledWith("/u/Blog/Slow software.md", expect.stringContaining("Body"));
    });

    it("renames when leaving the post while still on the title", async () => {
      render(NEW_POST, false, UNTITLED);
      const view = writer().view;
      act(() => view.dispatch(view.state.replaceSelection("Hello"), { userEvent: "input.type" }));
      await act(() => writer().flush());
      expect(renamePost).toHaveBeenCalledWith(UNTITLED, "", "Hello");
      expect(renamed).toEqual([[UNTITLED, "/u/Blog/Hello.md"]]);
      expect(writer().path()).toBe("/u/Blog/Hello.md");
    });

    it("leaves a post alone when its title wasn't edited", async () => {
      render(CRLF_POST);
      type(" more");
      await act(() => writer().flush());
      expect(renamePost).not.toHaveBeenCalled();
    });

    it("renames after the title is edited and the cursor moves off it", async () => {
      render(CRLF_POST);
      const view = writer().view;
      const end = view.state.doc.toString().indexOf("# Slow software") + "# Slow software".length;
      act(() => view.dispatch({ changes: { from: end, insert: " again" }, selection: { anchor: end + 6 }, userEvent: "input.type" }));
      expect(renamePost).not.toHaveBeenCalled();
      act(() => view.dispatch({ selection: { anchor: view.state.doc.length } }));
      await advance(0);
      expect(renamePost).toHaveBeenCalledWith(PATH, "Slow software", "Slow software again");
    });

    it("never renames for a title changed outside Folio", async () => {
      render(CRLF_POST);
      render(CRLF_POST.replace("# Slow software", "# Renamed in VS Code"));
      await advance(300);
      expect(writer().view.state.doc.toString()).toContain("# Renamed in VS Code");
      type(" more");
      await act(() => writer().flush());
      expect(renamePost).not.toHaveBeenCalled();
    });

    it("says so when the rename fails, and keeps saving to the old name", async () => {
      renamePost.mockImplementation(async () => Promise.reject("Folio only writes posts in your posts folder."));
      render(NEW_POST, false, UNTITLED);
      const view = writer().view;
      act(() => view.dispatch(view.state.replaceSelection("Hello"), { userEvent: "input.type" }));
      await act(() => writer().flush());
      expect(notify).toHaveBeenCalledWith("Couldn't rename Untitled.md: Folio only writes posts in your posts folder.");
      expect(renamed).toEqual([]);
      act(() => view.dispatch(view.state.replaceSelection("!"), { userEvent: "input.type" }));
      await advance(1000);
      expect(writePost).toHaveBeenLastCalledWith(UNTITLED, expect.stringContaining("Hello!"));
    });
  });
});

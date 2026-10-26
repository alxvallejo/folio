import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "./createEditor";
import { folioContextMenu } from "./contextMenu";
import type { LinkRequest } from "./links";

const menus: Array<Array<{ text?: string; action?: () => void }>> = [];
vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: async ({ items }: { items: Array<{ text?: string }> }) => (menus.push(items), { popup: async () => {} }) },
  MenuItem: { new: async (opts: { text: string; action: () => void }) => opts },
  PredefinedMenuItem: { new: async () => ({}) },
}));

afterEach(() => {
  menus.length = 0;
  document.body.innerHTML = "";
});

function setup(doc: string) {
  const open = vi.fn<(req: LinkRequest) => void>();
  const view = createEditor({ parent: document.body, doc, lineSeparator: "\n", onDocChange: () => {}, extensions: [folioContextMenu(open, vi.fn())] });
  // jsdom has no layout, so there is never a link under the pointer.
  vi.spyOn(view, "posAtCoords").mockReturnValue(null as unknown as number);
  const select = (from: number, to = from) => view.dispatch({ selection: EditorSelection.single(from, to) });
  const fire = (type: string, init: MouseEventInit = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    view.contentDOM.dispatchEvent(event);
    return event.defaultPrevented;
  };
  /** Waits for the menu, then picks "Add Link…" and returns the request it opened. */
  async function addLink() {
    await vi.waitFor(() => expect(menus.length).toBe(1));
    menus[0].find((i) => i.text === "Add Link…")!.action!();
    return open.mock.calls[0][0];
  }
  return { view, select, fire, addLink };
}

describe("folioContextMenu", () => {
  it("uses the selection from before a right-click moved the caret", async () => {
    const { select, fire, addLink } = setup("a Tauri b");
    select(2, 7);
    fire("mousedown", { button: 2 });
    select(4); // the click moves the caret
    expect(fire("contextmenu")).toBe(true);
    expect(await addLink()).toMatchObject({ from: 2, to: 7 });
  });

  it("records the selection on a Control-click too", async () => {
    const { select, fire, addLink } = setup("a Tauri b");
    select(2, 7);
    fire("mousedown", { button: 0, ctrlKey: true });
    select(4);
    expect(fire("contextmenu")).toBe(true);
    expect(await addLink()).toMatchObject({ from: 2, to: 7 });
  });

  it("uses the live selection for a menu with no mousedown before it", async () => {
    const { select, fire } = setup("a Tauri b");
    select(2, 7);
    fire("mousedown", { button: 2 });
    expect(fire("contextmenu")).toBe(true);
    select(4);
    // The keyboard menu key: no mousedown, and the earlier selection is gone.
    expect(fire("contextmenu")).toBe(false);
  });

  it("opens Folio's menu from the keyboard over a live selection", async () => {
    const { select, fire, addLink } = setup("a Tauri b");
    select(2, 7);
    expect(fire("contextmenu")).toBe(true);
    expect(await addLink()).toMatchObject({ from: 2, to: 7 });
  });
});

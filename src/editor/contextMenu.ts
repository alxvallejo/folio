import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { linkAt, linkRequest, removeLink, type LinkRequest } from "./links";

/** Folio's menu replaces the native one only when there is something to link: a prior selection or a link. */
export function contextMenuKind(selectionBeforeClick: { empty: boolean }, linkUnderPointer: boolean): "folio" | "native" {
  return !selectionBeforeClick.empty || linkUnderPointer ? "folio" : "native";
}

export async function showFolioContextMenu(view: EditorView, req: LinkRequest, open: (req: LinkRequest) => void): Promise<void> {
  const items = [
    await PredefinedMenuItem.new({ item: "Cut" }),
    await PredefinedMenuItem.new({ item: "Copy" }),
    await PredefinedMenuItem.new({ item: "Paste" }),
    await PredefinedMenuItem.new({ item: "Separator" }),
  ];
  if (req.existing) {
    const link = { from: req.from, to: req.to, ...req.existing };
    items.push(
      await MenuItem.new({ text: "Edit Link…", action: () => open(req) }),
      await MenuItem.new({
        text: "Remove Link",
        action: () => {
          view.dispatch(removeLink(view.state, link));
          view.focus();
        },
      }),
    );
  } else {
    items.push(await MenuItem.new({ text: "Add Link…", accelerator: "CmdOrCtrl+K", action: () => open(req) }));
  }
  const menu = await Menu.new({ items });
  await menu.popup();
}

/**
 * Right-click in the editor. The selection is read on mousedown, before the click can move it:
 * a prior selection or a link under the pointer gets Folio's menu, anything else the native one.
 */
export function folioContextMenu(open: (req: LinkRequest) => void, onError: (error: unknown) => void): Extension {
  let before = { empty: true, from: 0, to: 0 };
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 2) return false;
      const { empty, from, to } = view.state.selection.main;
      before = { empty, from, to };
      return false;
    },
    contextmenu(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const link = pos === null ? null : linkAt(view.state, pos);
      if (contextMenuKind(before, link !== null) === "native") return false;
      event.preventDefault();
      const anchor = { left: event.clientX, top: event.clientY };
      let req: LinkRequest;
      if (link) {
        req = { from: link.from, to: link.to, existing: { url: link.url, text: link.text }, needsText: false, anchor };
      } else {
        // The click may have moved the caret; the menu acts on what was selected before it.
        req = { ...linkRequest(view.state, anchor), from: before.from, to: before.to, existing: null, needsText: false };
      }
      showFolioContextMenu(view, req, open).catch(onError);
      return true;
    },
  });
}

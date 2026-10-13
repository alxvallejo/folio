export type Action =
  | "open-file"
  | "open-folder"
  | "find"
  | "toggle-sidebar"
  | "toggle-toc"
  | "open-in-editor"
  | "font-bigger"
  | "font-smaller"
  | "font-reset"
  | "settings";

type KeyInput = Pick<KeyboardEvent, "code" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">;

/** Maps a keydown to a Folio action. Uses physical key codes, so ⌥ and ⇧ don't change which key matched. */
export function actionFor(e: KeyInput): Action | null {
  if (!e.metaKey || e.ctrlKey) return null;
  const plain = !e.shiftKey && !e.altKey;
  switch (e.code) {
    case "KeyO":
      return e.altKey ? null : e.shiftKey ? "open-folder" : "open-file";
    case "KeyF":
      return plain ? "find" : null;
    case "Backslash":
      return e.shiftKey ? null : e.altKey ? "toggle-toc" : "toggle-sidebar";
    case "KeyE":
      return plain ? "open-in-editor" : null;
    case "Equal": // ⌘= and ⌘+ (⇧⌘=)
      return e.altKey ? null : "font-bigger";
    case "Minus":
      return plain ? "font-smaller" : null;
    case "Digit0":
      return plain ? "font-reset" : null;
    case "Comma":
      return plain ? "settings" : null;
    default:
      return null;
  }
}

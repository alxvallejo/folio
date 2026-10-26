import { basename } from "../lib/paths";

/**
 * Saves the open post before Folio leaves it (another file, quit, close, Install & Relaunch).
 * Resolves true to go ahead. When the save fails, `confirm` asks; anything but "Leave" stays.
 */
export async function leavePost(
  writer: { flush(): Promise<void> } | null,
  path: string | null,
  confirm: (message: string) => Promise<boolean>,
): Promise<boolean> {
  if (!writer) return true;
  try {
    await writer.flush();
    return true;
  } catch {
    const name = path ? basename(path) : "This post";
    return confirm(`${name} couldn't be saved. Leave it anyway? Your unsaved changes will be lost.`).catch(() => false);
  }
}

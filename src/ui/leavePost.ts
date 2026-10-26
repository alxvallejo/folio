import { basename } from "../lib/paths";

/**
 * Saves the open post before Folio leaves it (another file, quit, close, Install & Relaunch).
 * Resolves true to go ahead. When the save fails, `confirm` asks; anything but "Leave" stays.
 */
export async function leavePost(
  writer: { flush(): Promise<void>; path?(): string } | null,
  path: string | null,
  confirm: (message: string) => Promise<boolean>,
): Promise<boolean> {
  if (!writer) return true;
  try {
    await writer.flush();
    return true;
  } catch {
    // The flush may have renamed the post to follow its title.
    const current = writer.path?.() ?? path;
    const name = current ? basename(current) : "This post";
    return confirm(`${name} couldn't be saved. Leave it anyway? Your unsaved changes will be lost.`).catch(() => false);
  }
}

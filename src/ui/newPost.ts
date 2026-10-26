import { basename } from "../lib/paths";

/**
 * Creates a draft and opens it. Resolves false (after a toast) when the post couldn't be created.
 * Once it exists this resolves true, so the title box closes and a retry can't make "Title 2".
 */
export async function createAndOpenPost(
  title: string,
  deps: { create(title: string): Promise<string>; open(path: string): Promise<boolean>; notify(message: string): void },
): Promise<boolean> {
  let path: string;
  try {
    path = await deps.create(title);
  } catch (e) {
    deps.notify(String(e));
    return false;
  }
  // Stay on a failed save of the open post, or a failed read, leaves the new post unopened.
  const opened = await deps.open(path).catch(() => false);
  if (!opened) deps.notify(`Created ${basename(path)}, but didn't open it.`);
  return true;
}

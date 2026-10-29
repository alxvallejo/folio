/** How many files the sidebar's Recent section lists. */
export const RECENT_LIMIT = 8;

/** Moves `path` to the front, dropping its older entry and anything past the limit. */
export function pushRecent(list: string[], path: string, limit = RECENT_LIMIT): string[] {
  if (list[0] === path) return list;
  return [path, ...list.filter((p) => p !== path)].slice(0, limit);
}

/** Follows a rename in place, so a post renamed as its title is written keeps its spot. */
export function renameRecent(list: string[], from: string, to: string): string[] {
  if (!list.includes(from)) return list;
  return list.filter((p) => p !== to).map((p) => (p === from ? to : p));
}

export function forgetRecent(list: string[], path: string): string[] {
  return list.includes(path) ? list.filter((p) => p !== path) : list;
}

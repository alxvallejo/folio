/**
 * Case-insensitive matches of `query` in the text under `root`.
 * v1 limitation (spec): a match must sit inside a single text node.
 */
export function findRanges(root: Node, query: string): Range[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const haystack = text.toLowerCase();
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
      const range = doc.createRange();
      // Lowercasing can change length for a few characters (e.g. İ); clamp to the node.
      range.setStart(node, Math.min(at, text.length));
      range.setEnd(node, Math.min(at + needle.length, text.length));
      ranges.push(range);
    }
  }
  return ranges;
}

/** Whether the current match should scroll into view: only for an unconsumed user action, once results match the typed query. */
export function shouldReveal({ token, consumed, resultsReady, current }: { token: number; consumed: number; resultsReady: boolean; current: number }): boolean {
  return token !== consumed && resultsReady && current >= 0;
}

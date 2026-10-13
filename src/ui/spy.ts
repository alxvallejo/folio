/** Index of the section being read: the last heading whose top is within `threshold` px of the viewport top. */
export function activeHeadingIndex(
  tops: number[],
  scrollTop: number,
  { threshold = 96, atBottom = false }: { threshold?: number; atBottom?: boolean } = {},
): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= scrollTop + threshold) active = i;
    else break;
  }
  return active;
}

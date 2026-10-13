/** Distance from the top of the scroll container's content to `el`. */
export function offsetWithin(el: HTMLElement, container: HTMLElement): number {
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

function findTarget(container: HTMLElement, fragment: string): HTMLElement | null {
  for (const id of [fragment, fragment.toLowerCase()]) {
    const el = container.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (el) return el;
  }
  return null;
}

/** Scrolls to the element with id `fragment`; an empty fragment means the top. */
export function scrollToFragment(container: HTMLElement, fragment: string, smooth: boolean): void {
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  if (!fragment) {
    container.scrollTo({ top: 0, behavior });
    return;
  }
  const target = findTarget(container, fragment);
  if (target) container.scrollTo({ top: offsetWithin(target, container) - 16, behavior });
}

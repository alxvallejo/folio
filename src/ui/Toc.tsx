import { useEffect, useState, type RefObject } from "react";
import type { Heading } from "../render";
import { offsetWithin, scrollToFragment } from "./scroll";
import { activeHeadingIndex } from "./spy";

export const MIN_TOC_HEADINGS = 3;

interface Props {
  headings: Heading[];
  html: string;
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function Toc({ headings, html, scrollRef }: Props) {
  const [active, setActive] = useState(0);
  const baseLevel = Math.min(...headings.map((h) => h.level));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tops = headings.map((h) => {
        const el = container.querySelector<HTMLElement>(`[id="${CSS.escape(h.id)}"]`);
        return el ? offsetWithin(el, container) : Number.POSITIVE_INFINITY;
      });
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
      setActive(activeHeadingIndex(tops, container.scrollTop, { atBottom }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [headings, html, scrollRef]);

  return (
    <nav className="toc" aria-label="Contents">
      <div className="toc-title">Contents</div>
      <ul>
        {headings.map((heading, i) => (
          <li key={heading.id}>
            <button
              className={i === active ? "active" : undefined}
              style={{ paddingLeft: 14 + (heading.level - baseLevel) * 12 }}
              onClick={() => scrollRef.current && scrollToFragment(scrollRef.current, heading.id, true)}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

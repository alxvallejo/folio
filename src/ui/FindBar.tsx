import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { findRanges } from "./find";

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>;
  html: string;
  /** Changes whenever ⌘F is pressed, to refocus the input. */
  focusSignal: number;
  onClose: () => void;
}

interface Found {
  query: string;
  ranges: Range[];
}

const ALL = "folio-find";
const CURRENT = "folio-find-current";

export function FindBar({ scrollRef, html, focusSignal, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<Found>({ query: "", ranges: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const reveal = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  // Re-run after typing and after every document render (live reload, theme switch).
  useEffect(() => {
    const prose = scrollRef.current?.querySelector(".prose");
    setFound({ query, ranges: prose ? findRanges(prose, query) : [] });
  }, [query, html, scrollRef]);

  const count = found.ranges.length;
  const current = count ? Math.min(index, count - 1) : -1;

  useEffect(() => {
    if (!("highlights" in CSS)) return;
    CSS.highlights.set(ALL, new Highlight(...found.ranges));
    if (current < 0) {
      CSS.highlights.delete(CURRENT);
      return;
    }
    const range = found.ranges[current];
    CSS.highlights.set(CURRENT, new Highlight(range));
    // Only scroll on user intent (typing, Enter), and only once results match the typed query,
    // so a live reload with find open doesn't yank the reader to a match.
    if (reveal.current && found.query === query) {
      range.startContainer.parentElement?.scrollIntoView({ block: "center" });
      reveal.current = false;
    }
  }, [found, current, query]);

  useEffect(
    () => () => {
      if (!("highlights" in CSS)) return;
      CSS.highlights.delete(ALL);
      CSS.highlights.delete(CURRENT);
    },
    [],
  );

  const step = (delta: number) => {
    if (!count) return;
    reveal.current = true;
    setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        value={query}
        placeholder="Find"
        aria-label="Find in document"
        spellCheck={false}
        onChange={(e) => {
          reveal.current = true;
          setIndex(0);
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="find-count">{count ? `${current + 1} of ${count}` : query ? "No matches" : ""}</span>
      <button className="icon-button" aria-label="Previous match" onClick={() => step(-1)}>
        <ChevronUp size={16} />
      </button>
      <button className="icon-button" aria-label="Next match" onClick={() => step(1)}>
        <ChevronDown size={16} />
      </button>
      <button className="icon-button" aria-label="Close find" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

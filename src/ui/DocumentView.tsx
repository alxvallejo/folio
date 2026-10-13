import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from "react";
import { basename } from "../lib/paths";
import { scrollToFragment } from "./scroll";

interface Props {
  path: string;
  html: string;
  isEmpty: boolean;
  removed: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  fragment: string | null;
  onFragmentHandled: () => void;
  onLinkClick: (anchor: HTMLAnchorElement) => void;
}

export function DocumentView({ path, html, isEmpty, removed, scrollRef, fragment, onFragmentHandled, onLinkClick }: Props) {
  const lastPath = useRef<string | null>(null);
  const savedTop = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      savedTop.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // Same file re-rendered (live reload, theme change): restore the absolute scrollTop.
  // A different file: start at the top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (lastPath.current === path) {
      el.scrollTop = savedTop.current;
    } else {
      el.scrollTop = 0;
      savedTop.current = 0;
      lastPath.current = path;
    }
  }, [path, html, scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || fragment === null) return;
    scrollToFragment(el, fragment, false);
    onFragmentHandled();
  }, [fragment, html, scrollRef, onFragmentHandled]);

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest("a");
    if (!anchor) return;
    event.preventDefault();
    onLinkClick(anchor);
  };

  return (
    <>
      {removed && (
        <div className="banner" role="alert">
          File no longer exists
        </div>
      )}
      {isEmpty ? (
        <p className="empty-file">This file is empty.</p>
      ) : (
        <article className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </>
  );
}

interface LargeFilePromptProps {
  path: string;
  size: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LargeFilePrompt({ path, size, onConfirm, onCancel }: LargeFilePromptProps) {
  return (
    <div className="notice">
      <p>
        <strong>{basename(path)}</strong> is {(size / 1024 / 1024).toFixed(1)} MB. Render it anyway?
      </p>
      <div className="notice-actions">
        <button onClick={onConfirm}>Render</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

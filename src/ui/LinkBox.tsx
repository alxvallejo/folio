import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { removeLink, setLink, type LinkRequest } from "../editor/links";

interface Props {
  view: EditorView;
  request: LinkRequest;
  /** Closes the box; the editor has already taken focus back. */
  onClose: () => void;
}

export function LinkBox({ view, request, onClose }: Props) {
  const { existing, needsText, anchor } = request;
  const [url, setUrl] = useState(existing?.url ?? "");
  const [text, setText] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    urlRef.current?.focus();
    urlRef.current?.select();
  }, []);

  const close = () => {
    onClose();
    view.focus();
  };
  const apply = () => {
    const target = url.trim();
    if (!target) return;
    const range = existing ? { from: request.from, to: request.to, ...existing } : { from: request.from, to: request.to };
    view.dispatch(setLink(view.state, range, target, needsText ? text.trim() || target : undefined));
    close();
  };
  const remove = () => {
    if (existing) view.dispatch(removeLink(view.state, { from: request.from, to: request.to, ...existing }));
    close();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <>
      <div className="link-box-backdrop" onMouseDown={close} />
      <div className="link-box" role="dialog" aria-label={existing ? "Edit link" : "Add link"} style={{ left: anchor.left, top: anchor.top }}>
        {needsText && (
          <input type="text" value={text} placeholder="Text" aria-label="Text" spellCheck={false} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} />
        )}
        <input ref={urlRef} type="text" value={url} placeholder="https://" aria-label="URL" spellCheck={false} onChange={(e) => setUrl(e.target.value)} onKeyDown={onKeyDown} />
        {existing && (
          <button type="button" className="link-box-remove" onClick={remove}>
            Remove
          </button>
        )}
      </div>
    </>
  );
}

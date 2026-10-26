import { useEffect, useRef, useState } from "react";

interface Props {
  /** Creates and opens the post; resolves false (after telling the user) when it failed. */
  onCreate: (title: string) => Promise<boolean>;
  onClose: () => void;
}

export function NewPostBox({ onCreate, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      if (await onCreate(trimmed)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="new-post-box">
      <input
        ref={inputRef}
        type="text"
        value={title}
        placeholder="Post title"
        aria-label="Post title"
        spellCheck={false}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
    </div>
  );
}

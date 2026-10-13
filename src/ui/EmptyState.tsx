interface Props {
  message: string;
  onOpenFile: () => void;
  onOpenFolder: () => void;
}

export function EmptyState({ message, onOpenFile, onOpenFolder }: Props) {
  return (
    <div className="empty-state">
      <h1>Folio</h1>
      <p>{message}</p>
      <div className="empty-actions">
        <button onClick={onOpenFile}>
          Open File… <kbd>⌘O</kbd>
        </button>
        <button onClick={onOpenFolder}>
          Open Folder… <kbd>⇧⌘O</kbd>
        </button>
      </div>
    </div>
  );
}

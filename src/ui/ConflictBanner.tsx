interface Props {
  onUseDisk: () => void;
  onKeepMine: () => void;
}

/** Shown when the open post changed on disk while Alex had unsaved edits. */
export function ConflictBanner({ onUseDisk, onKeepMine }: Props) {
  return (
    <div className="banner conflict-banner" role="alert">
      <span>This post changed on disk.</span>
      <button type="button" onClick={onUseDisk}>
        Use the disk version
      </button>
      <button type="button" onClick={onKeepMine}>
        Keep mine
      </button>
    </div>
  );
}

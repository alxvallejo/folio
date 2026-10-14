import { bannerMessage, type UpdateState } from "../update/updater";

interface Props {
  state: UpdateState;
  onWhatsNew: (version: string) => void;
  onLater: () => void;
  onInstall: () => void;
}

/** Sits above the document in its own row, so it never covers text, and never takes focus. */
export function UpdateBanner({ state, onWhatsNew, onLater, onInstall }: Props) {
  const message = bannerMessage(state);
  if (message === null) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-message">{message}</span>
      {state.kind === "available" && (
        <>
          <button onClick={() => onWhatsNew(state.version)}>What's new</button>
          <button onClick={onLater}>Later</button>
          <button className="primary" onClick={onInstall}>
            Install &amp; Relaunch
          </button>
        </>
      )}
      {state.kind === "failed" && (
        <>
          <button onClick={onLater}>Dismiss</button>
          <button className="primary" onClick={onInstall}>
            Try Again
          </button>
        </>
      )}
    </div>
  );
}

import { sentence } from "../lib/text";
import type { ReportState } from "../report/runner";

interface Props {
  state: ReportState;
  /** True while the guide is open and no report command is set. */
  needsSetup: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  onOpenGuide: () => void;
  onSetUp: () => void;
}

/** File › Daily Report's progress and errors, in the same row as the update banner. */
export function ReportBanner({ state, needsSetup, onCancel, onDismiss, onOpenGuide, onSetUp }: Props) {
  if (state.kind === "running") {
    return (
      <div className="update-banner" role="status">
        <span className="update-message">Writing your report…</span>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div className="update-banner" role="alert">
        <span className="update-message">{sentence(`Couldn't write the report: ${state.message}`)}</span>
        <button onClick={onOpenGuide}>Open Guide</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }
  if (needsSetup) {
    return (
      <div className="update-banner" role="status">
        <span className="update-message">Once your script works, set it as the report command and File › Daily Report runs it.</span>
        <button className="primary" onClick={onSetUp}>
          Set Up in Settings
        </button>
      </div>
    );
  }
  return null;
}

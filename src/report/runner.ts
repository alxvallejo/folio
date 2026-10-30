export type ReportState = { kind: "idle" } | { kind: "running" } | { kind: "failed"; message: string };

export interface ReportDeps {
  /** Resolves with the report's path; rejects with the command's error output. */
  run(command: string): Promise<string>;
  /** Stops the running command. */
  cancel(): Promise<void>;
}

export interface ReportRunner {
  getState(): ReportState;
  subscribe(listener: () => void): () => void;
  /** Runs the command once at a time. Resolves with the report's path, or null when it failed, was cancelled or was already running. */
  start(command: string): Promise<string | null>;
  /** Stops a running command and hides the banner right away. */
  cancel(): void;
  /** Hides a failure. */
  dismiss(): void;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createReportRunner(deps: ReportDeps): ReportRunner {
  let state: ReportState = { kind: "idle" };
  // Bumped by cancel, so a run that ends after it was cancelled changes nothing.
  let run = 0;
  const listeners = new Set<() => void>();
  const set = (next: ReportState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start(command) {
      if (state.kind === "running") return null;
      const id = ++run;
      set({ kind: "running" });
      try {
        const path = await deps.run(command);
        if (id !== run) return null;
        set({ kind: "idle" });
        return path;
      } catch (e) {
        if (id === run) set({ kind: "failed", message: reason(e) });
        return null;
      }
    },
    cancel() {
      if (state.kind !== "running") return;
      run++;
      set({ kind: "idle" });
      void deps.cancel().catch(() => {});
    },
    dismiss() {
      if (state.kind === "failed") set({ kind: "idle" });
    },
  };
}

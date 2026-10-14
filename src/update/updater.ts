import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export const AUTO_CHECK_DELAY_MS = 30_000;

export const releaseNotesUrl = (version: string) => `https://github.com/alxvallejo/folio/releases/tag/v${version}`;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "failed"; version: string; message: string }
  | { kind: "dismissed" };

/** The parts of the plugin's `Update` that Folio uses. */
export interface PendingUpdate {
  version: string;
  downloadAndInstall(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

export interface UpdaterDeps {
  /** Resolves to null when Folio is up to date. */
  check(): Promise<PendingUpdate | null>;
  currentVersion(): Promise<string>;
  /** Starts the installed version on `path` and quits; only resolves if it fails to quit. */
  relaunch(path: string | null): Promise<void>;
  notify(message: string): void;
}

export interface Updater {
  getState(): UpdateState;
  subscribe(listener: () => void): () => void;
  /** Runs one silent check after `delayMs`, at most once per Updater. Returns a cancel function. */
  scheduleAutomaticCheck(delayMs?: number): () => void;
  /** Shows the banner if there is an update; silent otherwise. */
  checkAutomatically(): Promise<void>;
  /** Shows the banner, or a toast saying Folio is current or the check failed. */
  checkManually(): Promise<void>;
  /** From `available` or `failed`: downloads, installs, then relaunches on `path`. */
  install(path: string | null): Promise<void>;
  /** From `available` or `failed`: hides the banner. */
  dismiss(): void;
}

export function bannerMessage(state: UpdateState): string | null {
  switch (state.kind) {
    case "available":
      return `Folio ${state.version} is available.`;
    case "downloading":
      return state.percent === null ? "Downloading…" : `Downloading… ${state.percent}%`;
    case "installing":
      return "Installing…";
    case "failed":
      return `Couldn't install the update: ${state.message}`;
    default:
      return null;
  }
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createUpdater(deps: UpdaterDeps): Updater {
  let state: UpdateState = { kind: "idle" };
  let pending: PendingUpdate | null = null;
  let autoChecked = false;
  const listeners = new Set<() => void>();

  const set = (next: UpdateState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  // Reads `state` through a call so TypeScript doesn't keep a narrowing from before an await.
  const current = (): UpdateState => state;
  const busy = () => state.kind === "downloading" || state.kind === "installing";

  // A check can finish after the user started installing; its result must not replace the progress banner.
  function offer(update: PendingUpdate) {
    if (busy()) return;
    pending = update;
    set({ kind: "available", version: update.version });
  }

  async function checkAutomatically() {
    if (busy()) return;
    try {
      const update = await deps.check();
      if (update) offer(update);
    } catch {
      // Offline or a bad manifest: say nothing. The menu item reports errors.
    }
  }

  async function checkManually() {
    if (busy()) return;
    let update: PendingUpdate | null;
    let installed: string;
    try {
      [update, installed] = await Promise.all([deps.check(), deps.currentVersion()]);
    } catch (e) {
      if (!busy()) deps.notify(`Couldn't check for updates: ${reason(e)}.`);
      return;
    }
    if (update) offer(update);
    else if (!busy()) deps.notify(`You're on the latest version (${installed}).`);
  }

  function scheduleAutomaticCheck(delayMs = AUTO_CHECK_DELAY_MS) {
    if (autoChecked) return () => {};
    const timer = setTimeout(() => {
      autoChecked = true;
      void checkAutomatically();
    }, delayMs);
    return () => clearTimeout(timer);
  }

  async function install(path: string | null) {
    if (state.kind !== "available" && state.kind !== "failed") return;
    const retry = state.kind === "failed";
    let version = state.version;
    set({ kind: "downloading", version, percent: null });
    try {
      // After a failure, ask the server again rather than reusing a half-finished download.
      const update = retry ? await deps.check() : pending;
      if (!update) throw new Error("the update is no longer available");
      version = update.version;
      pending = update;
      let total: number | null = null;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          // 0 or missing means the size is unknown: show "Downloading…" with no percent.
          total = event.data.contentLength || null;
          if (total && current().kind === "downloading") set({ kind: "downloading", version, percent: 0 });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          const percent = total ? Math.min(100, Math.floor((received / total) * 100)) : null;
          const now = current();
          if (now.kind === "downloading" && now.percent !== percent) set({ kind: "downloading", version, percent });
        } else if (current().kind !== "installing") {
          set({ kind: "installing", version });
        }
      });
      if (current().kind !== "installing") set({ kind: "installing", version });
      await deps.relaunch(path);
    } catch (e) {
      pending = null;
      set({ kind: "failed", version, message: reason(e) });
    }
  }

  function dismiss() {
    if (state.kind === "available" || state.kind === "failed") set({ kind: "dismissed" });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scheduleAutomaticCheck,
    checkAutomatically,
    checkManually,
    install,
    dismiss,
  };
}

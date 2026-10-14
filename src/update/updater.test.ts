import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannerMessage, createUpdater, releaseNotesUrl, type PendingUpdate, type UpdaterDeps } from "./updater";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An update whose download the test drives by hand through `emit`, `finish` and `fail`. */
function fakeUpdate(version = "0.3.1") {
  const done = deferred<void>();
  let onEvent: (event: DownloadEvent) => void = () => {};
  const update: PendingUpdate & { emit(e: DownloadEvent): void; finish(): void; fail(e: unknown): void; started: boolean } = {
    version,
    started: false,
    downloadAndInstall(handler) {
      update.started = true;
      onEvent = handler;
      return done.promise;
    },
    emit: (e) => onEvent(e),
    finish: () => done.resolve(),
    fail: (e) => done.reject(e),
  };
  return update;
}

function setup(check: UpdaterDeps["check"]) {
  const deps = {
    check: vi.fn(check),
    currentVersion: vi.fn(async () => "0.3.0"),
    relaunch: vi.fn(async (_path: string | null) => {}),
    notify: vi.fn(),
  };
  const updater = createUpdater(deps);
  const changes = vi.fn();
  updater.subscribe(changes);
  return { deps, updater, changes };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("automatic check", () => {
  it("shows the banner when an update exists", async () => {
    const { updater, deps } = setup(async () => fakeUpdate());
    await updater.checkAutomatically();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.3.1" });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("doesn't bring back a banner dismissed with Later", async () => {
    const { updater } = setup(async () => fakeUpdate());
    await updater.checkManually();
    updater.dismiss();
    await updater.checkAutomatically();
    expect(updater.getState()).toEqual({ kind: "dismissed" });
  });

  it("is silent when there is no update or the check fails", async () => {
    const none = setup(async () => null);
    await none.updater.checkAutomatically();
    expect(none.updater.getState()).toEqual({ kind: "idle" });

    const offline = setup(async () => {
      throw new Error("offline");
    });
    await offline.updater.checkAutomatically();
    expect(offline.updater.getState()).toEqual({ kind: "idle" });
    expect(none.deps.notify).not.toHaveBeenCalled();
    expect(offline.deps.notify).not.toHaveBeenCalled();
  });
});

describe("scheduleAutomaticCheck", () => {
  afterEach(() => vi.useRealTimers());

  it("checks once after the delay", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(deps.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.check).toHaveBeenCalledTimes(1);
  });

  it("never checks when cancelled before the delay (setting turned off)", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    const cancel = updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(10_000);
    cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.check).not.toHaveBeenCalled();
  });

  it("checks at most once per launch, however often it is rescheduled", async () => {
    vi.useFakeTimers();
    const { updater, deps } = setup(async () => null);
    updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    const cancel = updater.scheduleAutomaticCheck(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    cancel();
    expect(deps.check).toHaveBeenCalledTimes(1);
  });
});

describe("manual check", () => {
  it("shows the banner when an update exists", async () => {
    const { updater, deps } = setup(async () => fakeUpdate("0.4.0"));
    await updater.checkManually();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.4.0" });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("says when Folio is up to date", async () => {
    const { updater, deps } = setup(async () => null);
    await updater.checkManually();
    expect(deps.notify).toHaveBeenCalledWith("You're on the latest version (0.3.0).");
    expect(updater.getState()).toEqual({ kind: "idle" });
  });

  it("says when the check fails", async () => {
    const { updater, deps } = setup(async () => {
      throw "error sending request";
    });
    await updater.checkManually();
    expect(deps.notify).toHaveBeenCalledWith("Couldn't check for updates: error sending request.");
  });

  it("brings back a banner dismissed with Later", async () => {
    const { updater } = setup(async () => fakeUpdate());
    await updater.checkAutomatically();
    updater.dismiss();
    expect(updater.getState()).toEqual({ kind: "dismissed" });
    await updater.checkManually();
    expect(updater.getState()).toEqual({ kind: "available", version: "0.3.1" });
  });

  it("is ignored while downloading or installing", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    await updater.checkManually();
    expect(deps.check).toHaveBeenCalledTimes(1);
    update.emit({ event: "Finished" });
    await updater.checkManually();
    expect(deps.check).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("stale check result", () => {
  it("never replaces the progress banner when a check finishes mid-install", async () => {
    const first = fakeUpdate();
    const late = deferred<PendingUpdate | null>();
    let calls = 0;
    const { updater, deps } = setup(() => (++calls === 1 ? Promise.resolve(first) : late.promise));
    await updater.checkAutomatically();
    const slowCheck = updater.checkManually();
    void updater.install(null);
    late.resolve(fakeUpdate("0.3.2"));
    await slowCheck;
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("drops a late 'up to date' or error result mid-install without a toast", async () => {
    const first = fakeUpdate();
    const late = deferred<PendingUpdate | null>();
    let calls = 0;
    const { updater, deps } = setup(() => (++calls === 1 ? Promise.resolve(first) : late.promise));
    await updater.checkAutomatically();
    const slowCheck = updater.checkManually();
    void updater.install(null);
    late.reject(new Error("offline"));
    await slowCheck;
    expect(updater.getState().kind).toBe("downloading");
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("install", () => {
  it("reports progress, installs, then relaunches on the open document", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    const done = updater.install("/Users/reader/Notes/a b.md");
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    update.emit({ event: "Started", data: { contentLength: 1000 } });
    update.emit({ event: "Progress", data: { chunkLength: 250 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 25 });
    update.emit({ event: "Progress", data: { chunkLength: 750 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 100 });
    update.emit({ event: "Finished" });
    expect(updater.getState()).toEqual({ kind: "installing", version: "0.3.1" });
    update.finish();
    await done;
    expect(deps.relaunch).toHaveBeenCalledWith("/Users/reader/Notes/a b.md");
  });

  it("shows an unknown size as no percent, never NaN or Infinity", async () => {
    for (const contentLength of [undefined, 0]) {
      const update = fakeUpdate();
      const { updater } = setup(async () => update);
      await updater.checkAutomatically();
      void updater.install(null);
      update.emit({ event: "Started", data: { contentLength } });
      update.emit({ event: "Progress", data: { chunkLength: 500 } });
      expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: null });
    }
  });

  it("caps the percent at 100 when the server sends more than it announced", async () => {
    const update = fakeUpdate();
    const { updater } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    update.emit({ event: "Started", data: { contentLength: 100 } });
    update.emit({ event: "Progress", data: { chunkLength: 150 } });
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.3.1", percent: 100 });
  });

  it("notifies subscribers only when the whole percent changes", async () => {
    const update = fakeUpdate();
    const { updater, changes } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    update.emit({ event: "Started", data: { contentLength: 1_000_000 } });
    changes.mockClear();
    for (let i = 0; i < 1000; i++) update.emit({ event: "Progress", data: { chunkLength: 100 } });
    // Started already showed 0%. 100 KB of 1 MB in 100-byte chunks: 10 whole-percent steps, not 1000 updates.
    expect(changes).toHaveBeenCalledTimes(10);
  });

  it("installs when the plugin never sends Finished", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    await updater.checkAutomatically();
    const done = updater.install(null);
    update.finish();
    await done;
    expect(deps.relaunch).toHaveBeenCalledWith(null);
  });

  it("shows the failure, and Try Again fetches a fresh update", async () => {
    const broken = fakeUpdate();
    const fresh = fakeUpdate();
    let calls = 0;
    const { updater, deps } = setup(async () => (++calls === 1 ? broken : fresh));
    await updater.checkAutomatically();
    const first = updater.install("/doc.md");
    broken.fail("signature verification failed");
    await first;
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "signature verification failed" });
    expect(deps.relaunch).not.toHaveBeenCalled();

    const retry = updater.install("/doc.md");
    await flush();
    expect(deps.check).toHaveBeenCalledTimes(2);
    expect(fresh.started).toBe(true);
    fresh.finish();
    await retry;
    expect(deps.relaunch).toHaveBeenCalledWith("/doc.md");
  });

  it("fails Try Again cleanly when the release was withdrawn", async () => {
    const broken = fakeUpdate();
    let calls = 0;
    const { updater } = setup(async () => (++calls === 1 ? broken : null));
    await updater.checkAutomatically();
    const first = updater.install(null);
    broken.fail(new Error("connection reset"));
    await first;
    await updater.install(null);
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "the update is no longer available" });
  });

  it("shows a relaunch failure", async () => {
    const update = fakeUpdate();
    const { updater, deps } = setup(async () => update);
    deps.relaunch.mockRejectedValueOnce("open failed");
    await updater.checkAutomatically();
    const done = updater.install(null);
    update.finish();
    await done;
    expect(updater.getState()).toEqual({ kind: "failed", version: "0.3.1", message: "open failed" });
  });

  it("does nothing unless an update is available or failed", async () => {
    const { updater, deps } = setup(async () => null);
    await updater.install(null);
    expect(updater.getState()).toEqual({ kind: "idle" });
    expect(deps.relaunch).not.toHaveBeenCalled();
  });
});

describe("dismiss", () => {
  it("hides an available or failed banner but not progress", async () => {
    const update = fakeUpdate();
    const { updater } = setup(async () => update);
    await updater.checkAutomatically();
    void updater.install(null);
    updater.dismiss();
    expect(updater.getState().kind).toBe("downloading");
    update.fail("disk full");
    await flush();
    updater.dismiss();
    expect(updater.getState()).toEqual({ kind: "dismissed" });
  });
});

describe("bannerMessage", () => {
  it("renders each state", () => {
    expect(bannerMessage({ kind: "idle" })).toBeNull();
    expect(bannerMessage({ kind: "dismissed" })).toBeNull();
    expect(bannerMessage({ kind: "available", version: "0.3.1" })).toBe("Folio 0.3.1 is available.");
    expect(bannerMessage({ kind: "downloading", version: "0.3.1", percent: 42 })).toBe("Downloading… 42%");
    expect(bannerMessage({ kind: "downloading", version: "0.3.1", percent: null })).toBe("Downloading…");
    expect(bannerMessage({ kind: "installing", version: "0.3.1" })).toBe("Installing…");
    expect(bannerMessage({ kind: "failed", version: "0.3.1", message: "disk full" })).toBe("Couldn't install the update: disk full");
  });
});

describe("releaseNotesUrl", () => {
  it("links the version's GitHub release", () => {
    expect(releaseNotesUrl("0.3.1")).toBe("https://github.com/alxvallejo/folio/releases/tag/v0.3.1");
  });
});

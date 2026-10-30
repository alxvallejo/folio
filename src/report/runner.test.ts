import { describe, expect, it, vi } from "vitest";
import { createReportRunner } from "./runner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createReportRunner", () => {
  it("shows running, then resolves with the report's path", async () => {
    const run = deferred<string>();
    const runner = createReportRunner({ run: () => run.promise, cancel: vi.fn(async () => {}) });
    const started = runner.start("~/daily-report/daily-report");
    expect(runner.getState()).toEqual({ kind: "running" });
    run.resolve("/u/Reports/2026-10-29.md");
    await expect(started).resolves.toBe("/u/Reports/2026-10-29.md");
    expect(runner.getState()).toEqual({ kind: "idle" });
  });

  it("keeps the command's error until dismissed", async () => {
    const runner = createReportRunner({ run: async () => Promise.reject("claude: command not found"), cancel: vi.fn(async () => {}) });
    await expect(runner.start("r")).resolves.toBeNull();
    expect(runner.getState()).toEqual({ kind: "failed", message: "claude: command not found" });
    runner.dismiss();
    expect(runner.getState()).toEqual({ kind: "idle" });
  });

  it("runs one command at a time", async () => {
    const run = vi.fn(() => new Promise<string>(() => {}));
    const runner = createReportRunner({ run, cancel: vi.fn(async () => {}) });
    void runner.start("r");
    await expect(runner.start("r")).resolves.toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });

  it("cancel hides the banner at once and ignores how the run ends", async () => {
    const run = deferred<string>();
    const cancel = vi.fn(async () => {});
    const runner = createReportRunner({ run: () => run.promise, cancel });
    const started = runner.start("r");
    runner.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(runner.getState()).toEqual({ kind: "idle" });
    run.reject("cancelled");
    await expect(started).resolves.toBeNull();
    expect(runner.getState()).toEqual({ kind: "idle" });
  });

  it("can run again after a cancel, and the old run can't interfere", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const runs = [first.promise, second.promise];
    const runner = createReportRunner({ run: () => runs.shift()!, cancel: vi.fn(async () => {}) });
    const a = runner.start("r");
    runner.cancel();
    const b = runner.start("r");
    first.resolve("/old.md");
    await expect(a).resolves.toBeNull();
    expect(runner.getState()).toEqual({ kind: "running" });
    second.resolve("/new.md");
    await expect(b).resolves.toBe("/new.md");
  });

  it("notifies subscribers", async () => {
    const runner = createReportRunner({ run: async () => "/r.md", cancel: vi.fn(async () => {}) });
    const listener = vi.fn();
    const unsubscribe = runner.subscribe(listener);
    await runner.start("r");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await runner.start("r");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

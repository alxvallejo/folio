import { describe, expect, it, vi } from "vitest";
import type { DefaultApp } from "../lib/api";
import { askOnFirstLaunch, shouldAsk, singleFlight } from "./defaultApp";

const warp: DefaultApp = { name: "Warp", isFolio: false, canSet: true };
const folio: DefaultApp = { name: "Folio", isFolio: true, canSet: true };
const fromDmg: DefaultApp = { name: "Warp", isFolio: false, canSet: false };

function deps(status: DefaultApp | Error, answer: "made" | "declined" | Error = "made") {
  return {
    status: vi.fn(async () => {
      if (status instanceof Error) throw status;
      return status;
    }),
    make: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    markAsked: vi.fn(async () => {}),
  };
}

describe("singleFlight", () => {
  it("ignores calls while one is pending, then allows the next", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const once = singleFlight(run);
    const first = once();
    void once();
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await first;
    void once();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("allows the next call after a failure", async () => {
    const run = vi.fn(async () => {
      throw new Error("permErr");
    });
    const once = singleFlight(run);
    await once().catch(() => {});
    await once().catch(() => {});
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("shouldAsk", () => {
  it("asks only a real install that isn't the default and hasn't asked", () => {
    expect(shouldAsk({ asked: false, status: warp })).toBe(true);
    expect(shouldAsk({ asked: true, status: warp })).toBe(false);
    expect(shouldAsk({ asked: false, status: folio })).toBe(false);
    expect(shouldAsk({ asked: false, status: fromDmg })).toBe(false);
  });
});

describe("askOnFirstLaunch", () => {
  it("asks once and remembers, whether accepted or declined", async () => {
    for (const answer of ["made", "declined"] as const) {
      const d = deps(warp, answer);
      await askOnFirstLaunch(false, d);
      expect(d.make).toHaveBeenCalledTimes(1);
      expect(d.markAsked).toHaveBeenCalledTimes(1);
    }
  });

  it("does nothing once it has asked", async () => {
    const d = deps(warp);
    await askOnFirstLaunch(true, d);
    expect(d.status).not.toHaveBeenCalled();
    expect(d.make).not.toHaveBeenCalled();
  });

  it("remembers without asking when Folio is already the default", async () => {
    const d = deps(folio);
    await askOnFirstLaunch(false, d);
    expect(d.make).not.toHaveBeenCalled();
    expect(d.markAsked).toHaveBeenCalledTimes(1);
  });

  it("neither asks nor remembers when not a real install, so the installed copy still asks", async () => {
    const d = deps(fromDmg);
    await askOnFirstLaunch(false, d);
    expect(d.make).not.toHaveBeenCalled();
    expect(d.markAsked).not.toHaveBeenCalled();
  });

  it("stays silent and unmarked on errors, so the next launch tries again", async () => {
    const statusFails = deps(new Error("ipc"));
    await expect(askOnFirstLaunch(false, statusFails)).resolves.toBeUndefined();
    expect(statusFails.markAsked).not.toHaveBeenCalled();

    const makeFails = deps(warp, new Error("permErr"));
    await expect(askOnFirstLaunch(false, makeFails)).resolves.toBeUndefined();
    expect(makeFails.markAsked).not.toHaveBeenCalled();
  });
});

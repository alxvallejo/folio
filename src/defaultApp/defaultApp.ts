import type { DefaultApp } from "../lib/api";

export const ASK_DELAY_MS = 2_000;

export function shouldAsk({ asked, status }: { asked: boolean; status: DefaultApp }): boolean {
  return !asked && status.canSet && !status.isFolio;
}

/** Wraps `run` so calls made while one is still pending are ignored (a double-click opens one macOS dialog). */
export function singleFlight(run: () => Promise<void>): () => Promise<void> {
  let pending = false;
  return async () => {
    if (pending) return;
    pending = true;
    try {
      await run();
    } finally {
      pending = false;
    }
  };
}

export interface FirstLaunchDeps {
  status(): Promise<DefaultApp>;
  /** Shows the macOS dialog. */
  make(): Promise<"made" | "declined">;
  markAsked(): Promise<void>;
}

/**
 * The one-time ask. macOS's own dialog is the only prompt. Accepted or declined, it is never
 * shown again. Errors mean no dialog appeared, so they stay silent and leave the key unset.
 */
export async function askOnFirstLaunch(asked: boolean, deps: FirstLaunchDeps): Promise<void> {
  if (asked) return;
  try {
    const status = await deps.status();
    if (status.isFolio) {
      await deps.markAsked();
      return;
    }
    if (!shouldAsk({ asked, status })) return;
    await deps.make();
    await deps.markAsked();
  } catch {
    // Try again next launch.
  }
}

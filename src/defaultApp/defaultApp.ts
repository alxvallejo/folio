import type { DefaultApp } from "../lib/api";

export const ASK_DELAY_MS = 2_000;

export function shouldAsk({ asked, status }: { asked: boolean; status: DefaultApp }): boolean {
  return !asked && status.canSet && !status.isFolio;
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

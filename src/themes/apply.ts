import { fontStack } from "./fonts";
import { PRESETS, type PresetId } from "./presets";

export type Appearance = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export interface ThemeInput {
  theme: PresetId;
  bodyFont: string;
  codeFont: string;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
}

export function resolveAppearance(preference: Appearance, systemDark: boolean): ResolvedAppearance {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function themeVariables(input: ThemeInput, appearance: ResolvedAppearance): Record<string, string> {
  const palette = PRESETS[input.theme][appearance];
  const body = fontStack(input.bodyFont, "body");
  return {
    "--bg": palette.bg,
    "--fg": palette.fg,
    "--muted": palette.muted,
    "--accent": palette.accent,
    "--border": palette.border,
    "--code-bg": palette.codeBg,
    "--code-fg": palette.codeFg,
    "--selection": palette.selection,
    "--font-body": body,
    "--font-heading": body,
    "--font-code": fontStack(input.codeFont, "code"),
    "--font-size": `${input.fontSize}px`,
    "--line-height": String(input.lineHeight),
    "--max-width": `${input.maxWidth}ch`,
  };
}

export function applyTheme(root: HTMLElement, input: ThemeInput, appearance: ResolvedAppearance): void {
  for (const [name, value] of Object.entries(themeVariables(input, appearance))) {
    root.style.setProperty(name, value);
  }
  root.dataset.appearance = appearance;
  root.dataset.theme = input.theme;
  root.style.colorScheme = appearance;
}

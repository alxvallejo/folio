import { THEMES, paletteFor, type Mode, type ThemeId } from "./catalog";
import { fontStack } from "./fonts";

export type Appearance = "system" | "light" | "dark";
export type ResolvedAppearance = Mode;

export interface ThemeInput {
  lightTheme: ThemeId;
  darkTheme: ThemeId;
  headingFont: string | null;
  bodyFont: string | null;
  codeFont: string | null;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
}

export function resolveAppearance(preference: Appearance, systemDark: boolean): ResolvedAppearance {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** The theme shown for an appearance: the light pick by day, the dark pick by night. */
export function activeTheme(input: Pick<ThemeInput, "lightTheme" | "darkTheme">, appearance: ResolvedAppearance): ThemeId {
  return appearance === "light" ? input.lightTheme : input.darkTheme;
}

export function themeVariables(input: ThemeInput, appearance: ResolvedAppearance): Record<string, string> {
  const id = activeTheme(input, appearance);
  const theme = THEMES[id];
  const p = paletteFor(id, appearance);
  return {
    "--bg": p.bg,
    "--fg": p.fg,
    "--muted": p.muted,
    "--border": p.border,
    "--selection": p.selection,
    "--heading": p.heading,
    "--link": p.link,
    "--link-underline": p.linkUnderline,
    "--accent": p.accent,
    "--highlight": p.highlight,
    "--code-bg": p.codeBg,
    "--code-fg": p.codeFg,
    "--quote": p.quote,
    "--wordmark-over": p.wordmarkOver,
    "--wordmark-under": p.wordmarkUnder,
    "--font-heading": fontStack(input.headingFont ?? theme.headingFont, "heading"),
    "--font-body": fontStack(input.bodyFont ?? theme.bodyFont, "body"),
    "--font-code": fontStack(input.codeFont ?? theme.codeFont, "code"),
    "--heading-weight": String(theme.heading.weight),
    "--heading-tracking": theme.heading.tracking,
    "--heading-style": theme.heading.style,
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
  root.dataset.theme = activeTheme(input, appearance);
  root.style.colorScheme = appearance;
}

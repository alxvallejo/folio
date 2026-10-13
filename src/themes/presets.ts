import type { ThemePair } from "../render/highlight";

export type PresetId = "paper" | "ia" | "github" | "catppuccin" | "nord" | "rose-pine";

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  border: string;
  codeBg: string;
  selection: string;
}

export interface Preset {
  id: PresetId;
  label: string;
  bodyFont: string;
  codeFont: string;
  light: Palette;
  dark: Palette;
  shiki: ThemePair;
}

export const PRESETS: Record<PresetId, Preset> = {
  paper: {
    id: "paper",
    label: "Paper",
    bodyFont: "Literata",
    codeFont: "JetBrains Mono",
    light: { bg: "#fbf8f1", fg: "#2b2622", muted: "#7a6f63", accent: "#a4471c", border: "#e6dccb", codeBg: "#f3ede1", selection: "#f2d7b6" },
    dark: { bg: "#1d1b18", fg: "#e6dfd2", muted: "#9b9183", accent: "#e39a63", border: "#36312a", codeBg: "#26231f", selection: "#4d3b28" },
    shiki: { light: "github-light", dark: "github-dark" },
  },
  ia: {
    id: "ia",
    label: "iA",
    bodyFont: "iA Writer Quattro",
    codeFont: "iA Writer Mono",
    light: { bg: "#f6f6f4", fg: "#1b1b1b", muted: "#737373", accent: "#0e8ec4", border: "#e0e0dc", codeBg: "#ececea", selection: "#bfe6f5" },
    dark: { bg: "#131313", fg: "#dcdcdc", muted: "#8a8a8a", accent: "#29b4e8", border: "#2a2a2a", codeBg: "#1c1c1c", selection: "#174a5e" },
    shiki: { light: "min-light", dark: "min-dark" },
  },
  github: {
    id: "github",
    label: "GitHub",
    bodyFont: "system-ui",
    codeFont: "SF Mono",
    light: { bg: "#ffffff", fg: "#1f2328", muted: "#59636e", accent: "#0969da", border: "#d1d9e0", codeBg: "#f6f8fa", selection: "#b6e3ff" },
    dark: { bg: "#0d1117", fg: "#e6edf3", muted: "#9198a1", accent: "#4493f8", border: "#3d444d", codeBg: "#151b23", selection: "#264f78" },
    shiki: { light: "github-light", dark: "github-dark" },
  },
  catppuccin: {
    id: "catppuccin",
    label: "Catppuccin",
    bodyFont: "Inter",
    codeFont: "JetBrains Mono",
    light: { bg: "#eff1f5", fg: "#4c4f69", muted: "#6c6f85", accent: "#8839ef", border: "#ccd0da", codeBg: "#e6e9ef", selection: "#bcc0cc" },
    dark: { bg: "#1e1e2e", fg: "#cdd6f4", muted: "#a6adc8", accent: "#cba6f7", border: "#313244", codeBg: "#181825", selection: "#45475a" },
    shiki: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
  },
  nord: {
    id: "nord",
    label: "Nord",
    bodyFont: "Source Serif 4",
    codeFont: "JetBrains Mono",
    // Code blocks intentionally stay dark Nord against the light page.
    light: { bg: "#eceff4", fg: "#2e3440", muted: "#4c566a", accent: "#5e81ac", border: "#d8dee9", codeBg: "#2e3440", selection: "#c2d0e4" },
    dark: { bg: "#2e3440", fg: "#d8dee9", muted: "#9aa3b2", accent: "#88c0d0", border: "#3b4252", codeBg: "#3b4252", selection: "#434c5e" },
    shiki: { light: "nord", dark: "nord" },
  },
  "rose-pine": {
    id: "rose-pine",
    label: "Rosé Pine",
    bodyFont: "Atkinson Hyperlegible",
    codeFont: "iA Writer Mono",
    light: { bg: "#faf4ed", fg: "#575279", muted: "#797593", accent: "#907aa9", border: "#f2e9e1", codeBg: "#fffaf3", selection: "#dfdad9" },
    dark: { bg: "#232136", fg: "#e0def4", muted: "#908caa", accent: "#c4a7e7", border: "#393552", codeBg: "#2a273f", selection: "#44415a" },
    shiki: { light: "rose-pine-dawn", dark: "rose-pine-moon" },
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRESETS, value);
}

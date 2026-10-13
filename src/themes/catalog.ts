export type ThemeId = "paper" | "minimal" | "riso" | "citrus" | "terracotta" | "klein" | "neon-noir";
export type Mode = "light" | "dark";

export interface Syntax {
  keyword: string;
  string: string;
  comment: string;
  function: string;
  number: string;
  type: string;
}

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  selection: string;
  heading: string;
  link: string;
  linkUnderline: string;
  /** App chrome: active sidebar row, pressed toolbar buttons, range inputs. */
  accent: string;
  /** Find matches and <mark>. */
  highlight: string;
  codeBg: string;
  codeFg: string;
  /** Blockquote rule. */
  quote: string;
  /** Wordmark top ink and the offset ink beneath it. */
  wordmarkOver: string;
  wordmarkUnder: string;
  syntax: Syntax;
}

export interface HeadingStyle {
  weight: number;
  tracking: string;
  style: "normal" | "italic";
}

export interface Theme {
  id: ThemeId;
  label: string;
  headingFont: string;
  bodyFont: string;
  codeFont: string;
  heading: HeadingStyle;
  palettes: Partial<Record<Mode, Palette>>;
}

export const THEMES: Record<ThemeId, Theme> = {
  paper: {
    id: "paper",
    label: "Paper",
    headingFont: "Fraunces",
    bodyFont: "Literata",
    codeFont: "JetBrains Mono",
    heading: { weight: 600, tracking: "-0.01em", style: "normal" },
    palettes: {
      light: {
        bg: "#fbf8f1", fg: "#2b2622", muted: "#7a6f63", border: "#e6dccb", selection: "#f2d7b6",
        heading: "#2b2622", link: "#a4471c", linkUnderline: "#e0b89f", accent: "#a4471c", highlight: "#f5d9a8",
        codeBg: "#f3ede1", codeFg: "#2b2622", quote: "#d9c7ad",
        wordmarkOver: "#2b2622", wordmarkUnder: "#a4471c",
        syntax: { keyword: "#a4471c", string: "#5d7a3a", comment: "#857a6d", function: "#2f5d8a", number: "#a0662a", type: "#7a4f8c" },
      },
      dark: {
        bg: "#1d1b18", fg: "#e6dfd2", muted: "#9b9183", border: "#36312a", selection: "#4d3b28",
        heading: "#f1e9dc", link: "#e39a63", linkUnderline: "#7a5236", accent: "#e39a63", highlight: "#5c4426",
        codeBg: "#26231f", codeFg: "#e6dfd2", quote: "#4a4238",
        wordmarkOver: "#f1e9dc", wordmarkUnder: "#e39a63",
        syntax: { keyword: "#e39a63", string: "#a9c47f", comment: "#7d7468", function: "#8ab4dc", number: "#e2b36d", type: "#c9a0dc" },
      },
    },
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    headingFont: "Geist",
    bodyFont: "Geist",
    codeFont: "Geist Mono",
    heading: { weight: 300, tracking: "-0.03em", style: "normal" },
    palettes: {
      light: {
        bg: "#fafafa", fg: "#171717", muted: "#737373", border: "#e5e5e5", selection: "#e0e0e0",
        heading: "#171717", link: "#171717", linkUnderline: "#a3a3a3", accent: "#171717", highlight: "#d4d4d4",
        codeBg: "#f0f0f0", codeFg: "#171717", quote: "#d4d4d4",
        wordmarkOver: "#171717", wordmarkUnder: "#a3a3a3",
        syntax: { keyword: "#0369a1", string: "#15803d", comment: "#808080", function: "#7c3aed", number: "#b45309", type: "#0e7490" },
      },
      dark: {
        bg: "#0a0a0a", fg: "#ededed", muted: "#a3a3a3", border: "#262626", selection: "#333333",
        heading: "#ededed", link: "#ededed", linkUnderline: "#525252", accent: "#ededed", highlight: "#404040",
        codeBg: "#161616", codeFg: "#ededed", quote: "#404040",
        wordmarkOver: "#ededed", wordmarkUnder: "#525252",
        syntax: { keyword: "#7dd3fc", string: "#86efac", comment: "#737373", function: "#c4b5fd", number: "#fcd34d", type: "#67e8f9" },
      },
    },
  },
  riso: {
    id: "riso",
    label: "Riso",
    headingFont: "Fraunces",
    bodyFont: "Literata",
    codeFont: "JetBrains Mono",
    heading: { weight: 900, tracking: "-0.02em", style: "normal" },
    palettes: {
      light: {
        bg: "#f6efe2", fg: "#1b2a6b", muted: "#5a6596", border: "#e2d6c2", selection: "#ffd0c9",
        heading: "#1b2a6b", link: "#c42d1d", linkUnderline: "#ff9d93", accent: "#ff5a4e", highlight: "#ffc2bb",
        codeBg: "#1b2a6b", codeFg: "#f6efe2", quote: "#ff5a4e",
        wordmarkOver: "#1b2a6b", wordmarkUnder: "#ff5a4e",
        syntax: { keyword: "#ff8a80", string: "#ffd8a8", comment: "#8d97c4", function: "#9fe3d6", number: "#ffb3d1", type: "#b8c4ff" },
      },
    },
  },
  citrus: {
    id: "citrus",
    label: "Citrus",
    headingFont: "Bricolage Grotesque",
    bodyFont: "Atkinson Hyperlegible",
    codeFont: "JetBrains Mono",
    heading: { weight: 800, tracking: "-0.03em", style: "normal" },
    palettes: {
      light: {
        bg: "#fffbe6", fg: "#22201a", muted: "#6e6650", border: "#efe6b8", selection: "#e4ff5c",
        heading: "#22201a", link: "#b84a00", linkUnderline: "#ff9a4d", accent: "#ff6a00", highlight: "#e4ff5c",
        codeBg: "#22201a", codeFg: "#fffbe6", quote: "#c8f21d",
        wordmarkOver: "#22201a", wordmarkUnder: "#ff6a00",
        syntax: { keyword: "#c8f21d", string: "#ffb86b", comment: "#8f8a73", function: "#7fd4ff", number: "#ff9a4d", type: "#f5e663" },
      },
    },
  },
  terracotta: {
    id: "terracotta",
    label: "Terracotta",
    headingFont: "DM Serif Display",
    bodyFont: "Source Serif 4",
    codeFont: "JetBrains Mono",
    heading: { weight: 400, tracking: "0", style: "normal" },
    palettes: {
      light: {
        bg: "#f2e3d3", fg: "#2a1a12", muted: "#725a4a", border: "#e0c9b3", selection: "#f0b99f",
        heading: "#b2431f", link: "#0f6f6c", linkUnderline: "#7fb5b3", accent: "#c4502a", highlight: "#f6c9a8",
        codeBg: "#0f3d3c", codeFg: "#f2e3d3", quote: "#c4502a",
        wordmarkOver: "#2a1a12", wordmarkUnder: "#c4502a",
        syntax: { keyword: "#ffb38a", string: "#c7e59b", comment: "#7f9e9c", function: "#f6d38a", number: "#ff9e7a", type: "#9be0d8" },
      },
    },
  },
  klein: {
    id: "klein",
    label: "Klein",
    headingFont: "Instrument Serif",
    bodyFont: "Inter",
    codeFont: "JetBrains Mono",
    heading: { weight: 400, tracking: "0", style: "italic" },
    palettes: {
      dark: {
        bg: "#0a2aa6", fg: "#f3f1ea", muted: "#b9c2ea", border: "#2443bd", selection: "#3550c8",
        heading: "#ffd23f", link: "#ffd23f", linkUnderline: "#b8962a", accent: "#ffd23f", highlight: "#806a00",
        codeBg: "#061c78", codeFg: "#e8ecff", quote: "#ffd23f",
        wordmarkOver: "#f3f1ea", wordmarkUnder: "#ffd23f",
        syntax: { keyword: "#ffd23f", string: "#a8f0c6", comment: "#8090d0", function: "#ff9fd2", number: "#ffb26b", type: "#9fe6ff" },
      },
    },
  },
  "neon-noir": {
    id: "neon-noir",
    label: "Neon Noir",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    codeFont: "JetBrains Mono",
    heading: { weight: 700, tracking: "-0.02em", style: "normal" },
    palettes: {
      dark: {
        bg: "#0e0d14", fg: "#ece9ff", muted: "#9a95b8", border: "#26233a", selection: "#3a2140",
        heading: "#ff2e88", link: "#00e0ff", linkUnderline: "#007f91", accent: "#ff2e88", highlight: "#5c1238",
        codeBg: "#17151f", codeFg: "#ece9ff", quote: "#ff2e88",
        wordmarkOver: "#00e0ff", wordmarkUnder: "#ff2e88",
        syntax: { keyword: "#ff2e88", string: "#00e0ff", comment: "#6e6890", function: "#c6a0ff", number: "#ffd166", type: "#7dffb0" },
      },
    },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEMES: Record<Mode, ThemeId> = { light: "riso", dark: "klein" };

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(THEMES, value);
}

export function supportsMode(id: ThemeId, mode: Mode): boolean {
  return THEMES[id].palettes[mode] !== undefined;
}

export function themesFor(mode: Mode): ThemeId[] {
  return THEME_IDS.filter((id) => supportsMode(id, mode));
}

export function paletteFor(id: ThemeId, mode: Mode): Palette {
  const palette = THEMES[id].palettes[mode];
  if (!palette) throw new Error(`Theme "${id}" has no ${mode} palette`);
  return palette;
}

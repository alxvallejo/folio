# Folio v0.2.0 — Bold Themes, Typography, and Icon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Folio's six muted themes with seven bold ones (Paper, Minimal, Riso, Citrus, Terracotta, Klein, Neon Noir). Each theme gets its own heading/body/code type pairing. Users pick separate light and dark themes. Folio also gets a real app icon and wordmark.

**Architecture:**
- **Theme catalog:** a new pure module, `src/themes/catalog.ts`, defines the themes, the palettes for each supported mode, and the fonts and heading style.
- **Contrast:** a WCAG contrast helper backs tests that enforce readable palettes.
- **Code highlighting:** Shiki themes are generated from each palette (`src/render/shikiThemes.ts`) instead of loaded from bundles.
- **Settings:** the `theme` key becomes `lightTheme`/`darkTheme`, migrated from v1 configs; font settings become nullable overrides.
- **Styling:** `prose.css` reads new per-theme CSS variables.
- **Icon:** a Python script outlines Fraunces glyphs into the icon and wordmark SVGs.

**Tech Stack:** existing (Tauri 2, React 19, TypeScript, Vitest, Shiki 4) + Fontsource packages (Fraunces, Instrument Serif, Bricolage Grotesque, Space Grotesk, DM Serif Display, Geist, Geist Mono) + Python fontTools (with brotli) and `rsvg-convert` for icon generation.

**Spec:** `docs/superpowers/specs/2026-10-13-folio-themes-icon-design.md`. Read it before any task. The v1 spec `docs/superpowers/specs/2026-10-12-folio-design.md` still governs everything this one doesn't replace.

## Global Constraints

- Theme ids, in this order: `paper`, `minimal`, `riso`, `citrus`, `terracotta`, `klein`, `neon-noir`. Light-capable: paper, minimal, riso, citrus, terracotta. Dark-capable: paper, minimal, klein, neon-noir.
- Defaults: light theme `riso`, dark theme `klein`, appearance `system`, font overrides `null`. Font size 18, line height 1.65, max width 68, editor `code`.
- Palette hex values and contrast minimums are exactly as in the spec's tables. A value may change only as far as needed to pass a contrast test, and every change must be recorded in the task report.
- Contrast minimums (WCAG ratio):
  - `fg`/`bg` ≥ 7
  - `codeFg`/`codeBg` ≥ 7
  - `muted`/`bg` ≥ 4.5
  - `link`/`bg` ≥ 4.5
  - `heading`/`bg` ≥ 3
  - each `syntax` color/`codeBg` ≥ 3
- Folio is read-only toward Markdown files. The only file it writes is `~/.config/folio/config.json`. Never touch the real `~/.config/folio` or `/Applications` from a task.
- tsconfig `lib` is ES2020: no `Array.prototype.at`, no `Object.hasOwn`.
- Cargo: `PATH="$HOME/.cargo/bin:$PATH" cargo …` (sourcing `~/.cargo/env` is blocked in the agent sandbox).
- Commits: short imperative subject, blank line, then the Co-Authored-By line for the model that wrote the commit.
- Spec deviation decided here: the spec's "latin subset only" for new fonts is dropped. Fontsource's variable packages ship only all-subset CSS (subsets load on demand via `unicode-range`). That costs about 1–2 MB of bundle size and is accepted.

## Review Focus

1. **v1 configs:**
   - `{"theme": "paper"}` must keep the user on Paper in both modes, and the next write must persist `lightTheme`/`darkTheme` rather than silently dropping the choice.
   - `{"theme": "nord"}` must fall back to Riso/Klein without errors.
   - Pinned by the `migrate` tests in Task 3.
2. **Wrong-mode ids** (`"lightTheme": "klein"`) must fall back to the slot default, never crash `paletteFor`. Pinned by the `effectiveSettings` wrong-mode test in Task 3.
3. **Theme pair identity:** the Shiki `{light, dark}` object passed to `useDocument` must be memoized. A fresh object on every render would re-render the whole document on every keystroke or scroll-driven state change. Pinned by the `useMemo` in Task 3, Step 7; the reviewer checks it.
4. **Unreadable palettes:** any palette whose text or code colors fail contrast. Pinned by the contrast table test in Task 1.
5. **Clearing a font override:** emptying the field must remove the key from config, not write `""`. Pinned by the `applyPatch` clearing test in Task 3.

---

## File Structure

```
src/themes/contrast.ts          NEW  luminance + WCAG contrast ratio
src/themes/contrast.test.ts     NEW
src/themes/catalog.ts           NEW  ThemeId, Mode, Palette, Theme, THEMES, helpers
src/themes/catalog.test.ts      NEW  completeness, modes, contrast, bundled fonts
src/themes/fonts.ts             MOD  HEADING_FONTS, Geist/Geist Mono, heading kind, isBundledFont, fontSuggestions
src/themes/load-fonts.ts        MOD  new Fontsource imports
src/themes/apply.ts             MOD  ThemeInput with lightTheme/darkTheme + nullable fonts; new CSS vars
src/themes/themes.test.ts       MOD  apply + fontStack tests only (preset tests move to catalog.test.ts)
src/themes/presets.ts           DEL
src/render/shikiThemes.ts       NEW  buildShikiTheme, shikiThemeName, FOLIO_SHIKI_THEMES
src/render/shikiThemes.test.ts  NEW
src/render/highlight.ts         MOD  ThemePair = {light: string; dark: string}; load FOLIO_SHIKI_THEMES
src/render/highlight.test.ts    MOD
src/render/render.test.ts       MOD  theme names; snapshot regenerated
src/settings/schema.ts          MOD  lightTheme/darkTheme, nullable fonts, migrate()
src/settings/schema.test.ts     MOD (rewritten)
src/settings/store.test.ts      MOD  two tests reference the old theme key
src/ui/App.tsx                  MOD  memoized shiki pair, active theme, toolbar wiring
src/ui/Toolbar.tsx              MOD  themes list for current mode
src/ui/SettingsPanel.tsx        MOD  two theme pickers, heading font, clearable font fields
src/ui/EmptyState.tsx           MOD  wordmark
src/styles/prose.css            MOD  heading/link/quote/highlight variables
src/styles/app.css              MOD  wordmark styles
scripts/icon/build-icon.py      NEW  outlines Fraunces glyphs → icon + wordmark SVGs
src-tauri/icons/source/folio-icon.svg  NEW (generated, committed)
src-tauri/icons/*               REGENERATED by `npx tauri icon`
docs/assets/folio-icon-512.png  NEW
docs/assets/folio-wordmark.svg  NEW
README.md                       MOD  wordmark header
package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json  MOD  version 0.2.0
```

---

### Task 1: Contrast helper, theme catalog, and bundled fonts

**Files:**
- Create: `src/themes/contrast.ts`, `src/themes/contrast.test.ts`, `src/themes/catalog.ts`, `src/themes/catalog.test.ts`
- Modify: `src/themes/fonts.ts`, `src/themes/load-fonts.ts`, `package.json` (new font deps)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `contrast.ts`: `luminance(hex: string): number`, `contrastRatio(a: string, b: string): number`
  - `catalog.ts`:
    - `type ThemeId`, `type Mode = "light" | "dark"`
    - `interface Syntax { keyword; string; comment; function; number; type }`
    - `interface Palette { bg; fg; muted; border; selection; heading; link; linkUnderline; accent; highlight; codeBg; codeFg; quote; syntax: Syntax }`
    - `interface HeadingStyle { weight: number; tracking: string; style: "normal" | "italic" }`
    - `interface Theme { id; label; headingFont; bodyFont; codeFont; heading: HeadingStyle; palettes: Partial<Record<Mode, Palette>> }`
    - `THEMES`, `THEME_IDS`, `DEFAULT_THEMES: Record<Mode, ThemeId>`
    - `isThemeId(v): v is ThemeId`, `supportsMode(id, mode): boolean`, `themesFor(mode): ThemeId[]`, `paletteFor(id, mode): Palette` (throws for an unsupported mode)
  - `fonts.ts`:
    - `HEADING_FONTS`, `BODY_FONTS`, `CODE_FONTS` (each `FontOption[]`)
    - `type FontKind = "heading" | "body" | "code"`
    - `fontStack(name, kind: FontKind)`, `isBundledFont(label): boolean`, `fontSuggestions(kind): string[]`
- `presets.ts` is untouched in this task. The new catalog is additive, so the app keeps compiling.

- [ ] **Step 1: Install the new fonts**

```bash
npm install @fontsource-variable/fraunces @fontsource/instrument-serif @fontsource-variable/bricolage-grotesque @fontsource-variable/space-grotesk @fontsource/dm-serif-display @fontsource-variable/geist @fontsource-variable/geist-mono
grep -ho "font-family: '[^']*'" node_modules/@fontsource-variable/{fraunces,bricolage-grotesque,space-grotesk,geist,geist-mono}/wght.css node_modules/@fontsource/{instrument-serif,dm-serif-display}/400.css | sort -u
```
Expected family names:
- `Bricolage Grotesque Variable`
- `DM Serif Display`
- `Fraunces Variable`
- `Geist Mono Variable`
- `Geist Variable`
- `Instrument Serif`
- `Space Grotesk Variable`

If any differ, use the printed name as the first entry of that font's stack in Step 6.

- [ ] **Step 2: Write the failing contrast tests**

`src/themes/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "./contrast";

describe("contrast", () => {
  it("computes relative luminance at the extremes", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("gives 21:1 for black on white and 1:1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#7a6f63", "#7a6f63")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1b2a6b", "#f6efe2")).toBeCloseTo(contrastRatio("#f6efe2", "#1b2a6b"), 10);
  });

  it("matches a known WCAG pair", () => {
    // #767676 on white is the classic 4.54:1 AA threshold color.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `npm test -- src/themes/contrast.test.ts` → FAIL, `Failed to resolve import "./contrast"`.

- [ ] **Step 4: Implement `src/themes/contrast.ts`**

```ts
function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2 contrast ratio between two #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

Run: `npm test -- src/themes/contrast.test.ts` → 4 passed.

- [ ] **Step 5: Write the failing catalog tests**

`src/themes/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES, THEME_IDS, THEMES, isThemeId, paletteFor, supportsMode, themesFor, type Mode, type Palette } from "./catalog";
import { contrastRatio } from "./contrast";
import { isBundledFont } from "./fonts";

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = ["accent", "bg", "border", "codeBg", "codeFg", "fg", "heading", "highlight", "link", "linkUnderline", "muted", "quote", "selection", "syntax"];
const SYNTAX_KEYS = ["comment", "function", "keyword", "number", "string", "type"];

const palettes: [string, Palette][] = THEME_IDS.flatMap((id) =>
  (["light", "dark"] as Mode[]).filter((mode) => supportsMode(id, mode)).map((mode) => [`${id}/${mode}`, paletteFor(id, mode)] as [string, Palette]),
);

describe("theme catalog", () => {
  it("has the seven themes in order", () => {
    expect(THEME_IDS).toEqual(["paper", "minimal", "riso", "citrus", "terracotta", "klein", "neon-noir"]);
  });

  it("splits themes by mode", () => {
    expect(themesFor("light")).toEqual(["paper", "minimal", "riso", "citrus", "terracotta"]);
    expect(themesFor("dark")).toEqual(["paper", "minimal", "klein", "neon-noir"]);
    expect(palettes).toHaveLength(9);
  });

  it("defaults to Riso by day and Klein by night", () => {
    expect(DEFAULT_THEMES).toEqual({ light: "riso", dark: "klein" });
    expect(supportsMode(DEFAULT_THEMES.light, "light")).toBe(true);
    expect(supportsMode(DEFAULT_THEMES.dark, "dark")).toBe(true);
  });

  it.each(palettes)("%s palette is complete hex", (_name, palette) => {
    expect(Object.keys(palette).sort()).toEqual(PALETTE_KEYS);
    expect(Object.keys(palette.syntax).sort()).toEqual(SYNTAX_KEYS);
    for (const [key, value] of Object.entries(palette)) if (key !== "syntax") expect(value, key).toMatch(HEX);
    for (const [key, value] of Object.entries(palette.syntax)) expect(value, `syntax.${key}`).toMatch(HEX);
  });

  it.each(palettes)("%s palette meets the contrast minimums", (_name, p) => {
    expect(contrastRatio(p.fg, p.bg), "fg/bg").toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.codeFg, p.codeBg), "codeFg/codeBg").toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.muted, p.bg), "muted/bg").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.link, p.bg), "link/bg").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.heading, p.bg), "heading/bg").toBeGreaterThanOrEqual(3);
    for (const [key, color] of Object.entries(p.syntax)) {
      expect(contrastRatio(color, p.codeBg), `syntax.${key}/codeBg`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(THEME_IDS)("%s uses only bundled fonts and a valid heading style", (id) => {
    const theme = THEMES[id];
    expect(theme.id).toBe(id);
    for (const font of [theme.headingFont, theme.bodyFont, theme.codeFont]) expect(isBundledFont(font), font).toBe(true);
    expect([300, 400, 600, 700, 800, 900]).toContain(theme.heading.weight);
    expect(theme.heading.tracking).toMatch(/^-?\d*\.?\d+em$|^0$/);
    expect(["normal", "italic"]).toContain(theme.heading.style);
  });

  it("validates ids and refuses unsupported modes", () => {
    expect(isThemeId("klein")).toBe(true);
    expect(isThemeId("nord")).toBe(false);
    expect(isThemeId(3)).toBe(false);
    expect(supportsMode("klein", "light")).toBe(false);
    expect(() => paletteFor("klein", "light")).toThrow();
  });
});
```

Run: `npm test -- src/themes/catalog.test.ts` → FAIL, `Failed to resolve import "./catalog"`.

- [ ] **Step 6: Update `src/themes/fonts.ts`** (replace the whole file)

```ts
export interface FontOption {
  label: string;
  stack: string;
}

export type FontKind = "heading" | "body" | "code";

/** Display faces used for headings. Body fonts are also offered for headings. */
export const HEADING_FONTS: FontOption[] = [
  { label: "Fraunces", stack: '"Fraunces Variable", Fraunces, Georgia, serif' },
  { label: "Instrument Serif", stack: '"Instrument Serif", Georgia, serif' },
  { label: "Bricolage Grotesque", stack: '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif' },
  { label: "Space Grotesk", stack: '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif' },
  { label: "DM Serif Display", stack: '"DM Serif Display", Georgia, serif' },
];

export const BODY_FONTS: FontOption[] = [
  { label: "Literata", stack: '"Literata Variable", Literata, Georgia, serif' },
  { label: "Source Serif 4", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  { label: "Inter", stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { label: "Geist", stack: '"Geist Variable", Geist, system-ui, sans-serif' },
  { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { label: "iA Writer Quattro", stack: '"iA Writer Quattro", system-ui, sans-serif' },
  { label: "system-ui", stack: "system-ui, -apple-system, sans-serif" },
];

export const CODE_FONTS: FontOption[] = [
  { label: "JetBrains Mono", stack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' },
  { label: "Geist Mono", stack: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace' },
  { label: "iA Writer Mono", stack: '"iA Writer Mono", ui-monospace, monospace' },
  { label: "SF Mono", stack: '"SF Mono", ui-monospace, Menlo, monospace' },
];

const ALL_FONTS = [...HEADING_FONTS, ...BODY_FONTS, ...CODE_FONTS];
const FALLBACK: Record<FontKind, string> = {
  heading: "system-ui, sans-serif",
  body: "system-ui, sans-serif",
  code: "ui-monospace, monospace",
};

/** CSS font-family value for a registered label or any installed family name. */
export function fontStack(name: string, kind: FontKind): string {
  const wanted = name.trim().toLowerCase();
  const known = ALL_FONTS.find((f) => f.label.toLowerCase() === wanted);
  if (known) return known.stack;
  const family = name.replace(/["\\;{}]/g, "").trim();
  return family ? `"${family}", ${FALLBACK[kind]}` : FALLBACK[kind];
}

export function isBundledFont(label: string): boolean {
  return ALL_FONTS.some((f) => f.label === label);
}

/** Labels offered in the settings font fields for each kind. */
export function fontSuggestions(kind: FontKind): string[] {
  const options = kind === "heading" ? [...HEADING_FONTS, ...BODY_FONTS] : kind === "body" ? BODY_FONTS : CODE_FONTS;
  return options.map((f) => f.label);
}
```

Append to `src/themes/load-fonts.ts` (after the existing imports, before `./ia-fonts.css`):

```ts
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
```

- [ ] **Step 7: Implement `src/themes/catalog.ts`**

```ts
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
        syntax: { keyword: "#a4471c", string: "#5d7a3a", comment: "#857a6d", function: "#2f5d8a", number: "#a0662a", type: "#7a4f8c" },
      },
      dark: {
        bg: "#1d1b18", fg: "#e6dfd2", muted: "#9b9183", border: "#36312a", selection: "#4d3b28",
        heading: "#f1e9dc", link: "#e39a63", linkUnderline: "#7a5236", accent: "#e39a63", highlight: "#5c4426",
        codeBg: "#26231f", codeFg: "#e6dfd2", quote: "#4a4238",
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
        syntax: { keyword: "#0369a1", string: "#15803d", comment: "#808080", function: "#7c3aed", number: "#b45309", type: "#0e7490" },
      },
      dark: {
        bg: "#0a0a0a", fg: "#ededed", muted: "#a3a3a3", border: "#262626", selection: "#333333",
        heading: "#ededed", link: "#ededed", linkUnderline: "#525252", accent: "#ededed", highlight: "#404040",
        codeBg: "#161616", codeFg: "#ededed", quote: "#404040",
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
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- src/themes && npx tsc --noEmit`

Expected: all catalog and contrast tests pass and tsc exits 0. The existing `themes.test.ts` still passes, because `presets.ts` is untouched.

If a contrast assertion fails:
- Adjust only the failing hex value, by the smallest change that passes (e.g. darken a link on a light page).
- Record `palette.key: old → new (ratio before → after)` in your report.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/themes/contrast.ts src/themes/contrast.test.ts src/themes/catalog.ts src/themes/catalog.test.ts src/themes/fonts.ts src/themes/load-fonts.ts
git commit -m "Add bold theme catalog, contrast checks, and new bundled fonts"
```
(Append your Co-Authored-By line.)

---

### Task 2: Shiki themes generated from palettes

**Files:**
- Create: `src/render/shikiThemes.ts`, `src/render/shikiThemes.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `THEME_IDS`, `supportsMode`, `paletteFor`, `Mode`, `ThemeId`, `Palette`, `Syntax` (Task 1).
- Produces:
  - `shikiThemeName(id: ThemeId, mode: Mode): string` → `folio-<id>-<mode>`
  - `buildShikiTheme(id, mode, palette): ThemeRegistrationRaw`
  - `FOLIO_SHIKI_THEMES: ThemeRegistrationRaw[]` (9 entries)
- Not wired into the highlighter yet; Task 3 does that.

- [ ] **Step 1: Write the failing tests**

`src/render/shikiThemes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paletteFor } from "../themes/catalog";
import { FOLIO_SHIKI_THEMES, buildShikiTheme, shikiThemeName } from "./shikiThemes";

describe("generated Shiki themes", () => {
  it("names themes by id and mode", () => {
    expect(shikiThemeName("neon-noir", "dark")).toBe("folio-neon-noir-dark");
  });

  it("generates one theme per palette", () => {
    expect(FOLIO_SHIKI_THEMES.map((t) => t.name)).toEqual([
      "folio-paper-light",
      "folio-paper-dark",
      "folio-minimal-light",
      "folio-minimal-dark",
      "folio-riso-light",
      "folio-citrus-light",
      "folio-terracotta-light",
      "folio-klein-dark",
      "folio-neon-noir-dark",
    ]);
  });

  it("carries the palette's code background, foreground, and all six syntax colors", () => {
    const palette = paletteFor("riso", "light");
    const theme = buildShikiTheme("riso", "light", palette);
    expect(theme.type).toBe("light");
    expect(theme.colors).toEqual({ "editor.background": palette.codeBg, "editor.foreground": palette.codeFg });
    const foregrounds = theme.settings.map((s) => s.settings.foreground);
    for (const color of Object.values(palette.syntax)) expect(foregrounds).toContain(color);
    expect(theme.settings[0]).toEqual({ settings: { foreground: palette.codeFg, background: palette.codeBg } });
  });

  it("italicizes comments", () => {
    const theme = buildShikiTheme("klein", "dark", paletteFor("klein", "dark"));
    const comment = theme.settings.find((s) => Array.isArray(s.scope) && s.scope.includes("comment"));
    expect(comment?.settings.fontStyle).toBe("italic");
  });
});
```

Run: `npm test -- src/render/shikiThemes.test.ts` → FAIL, `Failed to resolve import "./shikiThemes"`.

- [ ] **Step 2: Implement `src/render/shikiThemes.ts`**

First confirm the type name: `grep -n "ThemeRegistrationRaw" node_modules/shiki/dist/core.d.mts node_modules/@shikijs/types/dist/index.d.mts | head -3`. If `shiki/core` doesn't re-export it, import the type from `@shikijs/types` instead (a dependency of shiki, so it's installed).

```ts
import type { ThemeRegistrationRaw } from "shiki/core";
import { THEME_IDS, paletteFor, supportsMode, type Mode, type Palette, type Syntax, type ThemeId } from "../themes/catalog";

const SCOPES: Record<keyof Syntax, string[]> = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: ["keyword", "storage", "storage.type", "keyword.operator.new"],
  string: ["string", "string.quoted", "string.template"],
  number: ["constant.numeric", "constant.language", "constant.character"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  type: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.name.tag"],
};

export function shikiThemeName(id: ThemeId, mode: Mode): string {
  return `folio-${id}-${mode}`;
}

export function buildShikiTheme(id: ThemeId, mode: Mode, palette: Palette): ThemeRegistrationRaw {
  return {
    name: shikiThemeName(id, mode),
    type: mode,
    colors: { "editor.background": palette.codeBg, "editor.foreground": palette.codeFg },
    settings: [
      { settings: { foreground: palette.codeFg, background: palette.codeBg } },
      ...(Object.keys(SCOPES) as (keyof Syntax)[]).map((key) => ({
        scope: SCOPES[key],
        settings: { foreground: palette.syntax[key], ...(key === "comment" ? { fontStyle: "italic" } : {}) },
      })),
    ],
  };
}

/** Every palette as a Shiki theme, in catalog order (light before dark within a theme). */
export const FOLIO_SHIKI_THEMES: ThemeRegistrationRaw[] = THEME_IDS.flatMap((id) =>
  (["light", "dark"] as Mode[]).filter((mode) => supportsMode(id, mode)).map((mode) => buildShikiTheme(id, mode, paletteFor(id, mode))),
);
```

- [ ] **Step 3: Run and type-check**

Run: `npm test -- src/render/shikiThemes.test.ts && npx tsc --noEmit`

Expected: 4 passed; tsc exits 0. If tsc rejects `theme.settings[i].settings` access in the test because of the Shiki type, narrow it in the test with `const settings = theme.settings as { scope?: string[]; settings: { foreground?: string; background?: string; fontStyle?: string } }[];` and record that as a deviation.

- [ ] **Step 4: Commit**

```bash
git add src/render/shikiThemes.ts src/render/shikiThemes.test.ts
git commit -m "Generate code highlighting themes from each palette"
```

---
### Task 3: Switch the app to the new themes and settings

**Files:**
- Modify:
  - `src/settings/schema.ts` and `src/settings/schema.test.ts` (both rewritten)
  - `src/settings/store.test.ts` (2 lines)
  - `src/themes/apply.ts` and `src/themes/themes.test.ts` (both rewritten)
  - `src/render/highlight.ts`, `src/render/highlight.test.ts`, `src/render/render.test.ts`
  - `src/ui/App.tsx`, `src/ui/Toolbar.tsx`, `src/ui/SettingsPanel.tsx` (rewritten), `src/ui/useDocument.ts` (comment only)
- Delete: `src/themes/presets.ts`
- Regenerate: `src/render/__snapshots__/gfm.html`

**Interfaces:**
- Consumes: Task 1 catalog and fonts; Task 2 `FOLIO_SHIKI_THEMES`, `shikiThemeName`.
- Produces:
  - `Settings` = `{ lightTheme: ThemeId; darkTheme: ThemeId; appearance; headingFont: string | null; bodyFont: string | null; codeFont: string | null; fontSize; lineHeight; maxWidth; editorCommand; lastFolder }`
  - `DEFAULTS: Settings`, `migrate(raw): RawConfig`
  - `activeTheme(input, appearance): ThemeId` (apply.ts)
  - `ThemePair = { light: string; dark: string }` (Shiki theme names)
  - `themeVariables` writes:
    - colors: `--bg --fg --muted --border --selection --heading --link --link-underline --accent --highlight --code-bg --code-fg --quote`
    - fonts and heading style: `--font-heading --font-body --font-code --heading-weight --heading-tracking --heading-style`
    - sizing: `--font-size --line-height --max-width`
- Store behavior (`store.ts`) is unchanged and must stay so. Only two of its tests change.

- [ ] **Step 1: Rewrite `src/settings/schema.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULTS, applyPatch, effectiveSettings, migrate, parseConfig, serializeConfig } from "./schema";

describe("effectiveSettings", () => {
  it("returns the defaults for an empty config", () => {
    expect(effectiveSettings({})).toEqual({
      lightTheme: "riso",
      darkTheme: "klein",
      appearance: "system",
      headingFont: null,
      bodyFont: null,
      codeFont: null,
      fontSize: 18,
      lineHeight: 1.65,
      maxWidth: 68,
      editorCommand: "code",
      lastFolder: null,
    });
    expect(effectiveSettings({})).toEqual(DEFAULTS);
  });

  it("reads theme picks and trimmed font overrides", () => {
    expect(effectiveSettings({ lightTheme: "citrus", darkTheme: "neon-noir", headingFont: " Charter ", codeFont: "Geist Mono" })).toMatchObject({
      lightTheme: "citrus",
      darkTheme: "neon-noir",
      headingFont: "Charter",
      bodyFont: null,
      codeFont: "Geist Mono",
    });
  });

  it("falls back when a theme is unknown or picked for the wrong mode", () => {
    expect(effectiveSettings({ lightTheme: "klein", darkTheme: "riso" })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    expect(effectiveSettings({ lightTheme: "solarized", darkTheme: 7 })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    expect(effectiveSettings({ lightTheme: "paper", darkTheme: "minimal" })).toMatchObject({ lightTheme: "paper", darkTheme: "minimal" });
  });

  it("clamps out-of-range numbers", () => {
    const s = effectiveSettings({ fontSize: 40, lineHeight: 0.5, maxWidth: 200 });
    expect([s.fontSize, s.lineHeight, s.maxWidth]).toEqual([24, 1.3, 90]);
  });

  it("ignores values of the wrong type", () => {
    expect(effectiveSettings({ appearance: "dim", fontSize: "20", bodyFont: "  ", headingFont: 3, lastFolder: 7 })).toEqual(DEFAULTS);
  });
});

describe("migrate", () => {
  it("keeps a v1 Paper user on Paper in both modes", () => {
    expect(migrate({ theme: "paper", fontSize: 20 })).toEqual({ fontSize: 20, lightTheme: "paper", darkTheme: "paper" });
    expect(effectiveSettings({ theme: "paper" })).toMatchObject({ lightTheme: "paper", darkTheme: "paper" });
  });

  it("drops removed or unknown v1 themes so the defaults apply", () => {
    for (const theme of ["nord", "ia", "github", "catppuccin", "rose-pine", "nonsense", 3]) {
      expect(migrate({ theme, maxWidth: 70 })).toEqual({ maxWidth: 70 });
      expect(effectiveSettings({ theme })).toMatchObject({ lightTheme: "riso", darkTheme: "klein" });
    }
  });

  it("lets explicit new keys win over a legacy theme", () => {
    expect(migrate({ theme: "paper", lightTheme: "citrus" })).toEqual({ lightTheme: "citrus" });
  });

  it("returns a current config unchanged", () => {
    const raw = { lightTheme: "terracotta" };
    expect(migrate(raw)).toBe(raw);
  });
});

describe("applyPatch", () => {
  it("writes only keys that differ from the defaults", () => {
    expect(applyPatch({}, { fontSize: 20 })).toEqual({ fontSize: 20 });
    expect(applyPatch({ fontSize: 20 }, { fontSize: 18 })).toEqual({});
  });

  it("writes theme picks only when they differ from Riso and Klein", () => {
    expect(applyPatch({}, { lightTheme: "citrus" })).toEqual({ lightTheme: "citrus" });
    expect(applyPatch({ lightTheme: "citrus" }, { lightTheme: "riso" })).toEqual({});
    expect(applyPatch({}, { darkTheme: "neon-noir" })).toEqual({ darkTheme: "neon-noir" });
  });

  it("persists the v1 migration and drops the legacy key on the next write", () => {
    expect(applyPatch({ theme: "paper" }, { fontSize: 20 })).toEqual({ lightTheme: "paper", darkTheme: "paper", fontSize: 20 });
    expect(applyPatch({ theme: "nord" }, { fontSize: 20 })).toEqual({ fontSize: 20 });
  });

  it("clears a font override when emptied instead of writing an empty string", () => {
    expect(applyPatch({ headingFont: "Charter" }, { headingFont: "  " })).toEqual({});
    expect(applyPatch({ bodyFont: "Charter" }, { bodyFont: null })).toEqual({});
    expect(applyPatch({}, { codeFont: " Geist Mono " })).toEqual({ codeFont: "Geist Mono" });
  });

  it("clamps and rounds numeric values", () => {
    expect(applyPatch({}, { fontSize: 30, lineHeight: 1.3 + 0.05 * 7, maxWidth: 70.4 })).toEqual({ fontSize: 24, maxWidth: 70 });
  });

  it("preserves unknown keys", () => {
    expect(applyPatch({ future: true }, { maxWidth: 72 })).toEqual({ future: true, maxWidth: 72 });
  });
});

describe("parse and serialize", () => {
  it("parses JSON objects", () => {
    expect(parseConfig('{"fontSize": 20}')).toEqual({ ok: true, raw: { fontSize: 20 } });
  });

  it("treats a blank file as empty config", () => {
    expect(parseConfig("  \n")).toEqual({ ok: true, raw: {} });
  });

  it("rejects invalid JSON and non-objects", () => {
    expect(parseConfig("{ broken").ok).toBe(false);
    expect(parseConfig("[1, 2]").ok).toBe(false);
    expect(parseConfig("null").ok).toBe(false);
  });

  it("serializes with two-space indent and a trailing newline", () => {
    expect(serializeConfig({ lightTheme: "citrus" })).toBe('{\n  "lightTheme": "citrus"\n}\n');
  });
});
```

In `src/settings/store.test.ts`, change exactly two lines:
- `settings: { theme: "paper", fontSize: 18 }` → `settings: { lightTheme: "riso", fontSize: 18 }`
- `await store.update({ theme: "nord" });` → `await store.update({ lightTheme: "citrus" });`

- [ ] **Step 2: Rewrite `src/themes/themes.test.ts`**

The preset tests are superseded by `catalog.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { activeTheme, applyTheme, resolveAppearance, themeVariables } from "./apply";
import { paletteFor } from "./catalog";
import { BODY_FONTS, HEADING_FONTS, fontStack, fontSuggestions, isBundledFont } from "./fonts";

describe("fontStack", () => {
  it("maps registered labels case-insensitively", () => {
    expect(fontStack("literata", "body")).toBe(BODY_FONTS.find((f) => f.label === "Literata")!.stack);
    expect(fontStack("Fraunces", "heading")).toBe(HEADING_FONTS.find((f) => f.label === "Fraunces")!.stack);
  });

  it("quotes any installed family with a sensible fallback", () => {
    expect(fontStack("Charter", "body")).toBe('"Charter", system-ui, sans-serif');
    expect(fontStack("Charter", "heading")).toBe('"Charter", system-ui, sans-serif');
    expect(fontStack("Berkeley Mono", "code")).toBe('"Berkeley Mono", ui-monospace, monospace');
  });

  it("strips characters that could break out of the CSS value", () => {
    expect(fontStack('Evil"; color: red; {', "body")).toBe('"Evil color: red", system-ui, sans-serif');
    expect(fontStack("  ", "code")).toBe("ui-monospace, monospace");
  });
});

describe("font registry", () => {
  it("knows which fonts are bundled", () => {
    expect(isBundledFont("Geist")).toBe(true);
    expect(isBundledFont("Comic Sans")).toBe(false);
  });

  it("offers display and body fonts for headings", () => {
    expect(fontSuggestions("heading")).toEqual(expect.arrayContaining(["Fraunces", "Instrument Serif", "Literata"]));
    expect(fontSuggestions("code")).toContain("Geist Mono");
  });
});

describe("apply", () => {
  const input = {
    lightTheme: "riso" as const,
    darkTheme: "klein" as const,
    headingFont: null,
    bodyFont: null,
    codeFont: null,
    fontSize: 18,
    lineHeight: 1.65,
    maxWidth: 68,
  };

  it("resolves appearance", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });

  it("shows the light pick by day and the dark pick by night", () => {
    expect(activeTheme(input, "light")).toBe("riso");
    expect(activeTheme(input, "dark")).toBe("klein");
  });

  it("maps the active theme onto CSS custom properties", () => {
    const vars = themeVariables(input, "dark");
    const p = paletteFor("klein", "dark");
    expect(vars).toMatchObject({
      "--bg": p.bg,
      "--fg": p.fg,
      "--heading": p.heading,
      "--link": p.link,
      "--link-underline": p.linkUnderline,
      "--accent": p.accent,
      "--highlight": p.highlight,
      "--quote": p.quote,
      "--code-bg": p.codeBg,
      "--code-fg": p.codeFg,
      "--heading-weight": "400",
      "--heading-tracking": "0",
      "--heading-style": "italic",
      "--font-size": "18px",
      "--line-height": "1.65",
      "--max-width": "68ch",
    });
    expect(vars["--font-heading"]).toContain("Instrument Serif");
    expect(vars["--font-body"]).toContain("Inter");
    expect(vars["--font-code"]).toContain("JetBrains Mono");
  });

  it("lets font overrides win over the theme's fonts", () => {
    const vars = themeVariables({ ...input, headingFont: "Charter", bodyFont: "Geist", codeFont: "Geist Mono" }, "light");
    expect(vars["--font-heading"]).toBe('"Charter", system-ui, sans-serif');
    expect(vars["--font-body"]).toContain("Geist Variable");
    expect(vars["--font-code"]).toContain("Geist Mono Variable");
  });

  it("writes variables and data attributes onto the root", () => {
    const root = document.documentElement;
    applyTheme(root, input, "light");
    expect(root.style.getPropertyValue("--bg")).toBe(paletteFor("riso", "light").bg);
    expect(root.dataset.appearance).toBe("light");
    expect(root.dataset.theme).toBe("riso");
  });
});
```

- [ ] **Step 3: Update the highlighter tests**

In `src/render/highlight.test.ts`:
- Replace `import { SHIKI_THEMES, getHighlighter, makeHighlight } from "./highlight";` with:
  ```ts
  import { getHighlighter, makeHighlight } from "./highlight";
  import { FOLIO_SHIKI_THEMES } from "./shikiThemes";
  ```
- Replace `const highlight = () => makeHighlight(hl, { light: "github-light", dark: "github-dark" });` with `const highlight = () => makeHighlight(hl, { light: "folio-riso-light", dark: "folio-klein-dark" });`
- Replace the body of `it("loads every preset theme", …)` with `expect(hl.getLoadedThemes()).toEqual(expect.arrayContaining(FOLIO_SHIKI_THEMES.map((t) => t.name)));`
- Add this test inside the `describe`:

```ts
  it("colors tokens from the active palettes", () => {
    const html = highlight()("const x = 1;", "typescript");
    expect(html).toMatch(/--shiki-light:#ff8a80/i); // riso keyword
    expect(html).toMatch(/--shiki-dark:#ffd23f/i); // klein keyword
  });
```

In `src/render/render.test.ts`, change `const themes = { light: "github-light", dark: "github-dark" } as const;` to `const themes = { light: "folio-riso-light", dark: "folio-klein-dark" };`.

Run: `npm test -- src/settings src/themes src/render` → expected FAIL. `schema` exports and `activeTheme` don't exist yet, and the highlighter doesn't know the folio theme names.

- [ ] **Step 4: Rewrite `src/settings/schema.ts`**

```ts
import type { Appearance } from "../themes/apply";
import { DEFAULT_THEMES, isThemeId, supportsMode, type Mode, type ThemeId } from "../themes/catalog";

export interface Settings {
  lightTheme: ThemeId;
  darkTheme: ThemeId;
  appearance: Appearance;
  /** Font overrides; null means "use the shown theme's font". */
  headingFont: string | null;
  bodyFont: string | null;
  codeFont: string | null;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  editorCommand: string;
  lastFolder: string | null;
}

export type RawConfig = Record<string, unknown>;

export const RANGES = {
  fontSize: { min: 14, max: 24, step: 1 },
  lineHeight: { min: 1.3, max: 2, step: 0.05 },
  maxWidth: { min: 55, max: 90, step: 1 },
} as const;

type NumericKey = keyof typeof RANGES;

export const DEFAULTS: Settings = {
  lightTheme: DEFAULT_THEMES.light,
  darkTheme: DEFAULT_THEMES.dark,
  appearance: "system",
  headingFont: null,
  bodyFont: null,
  codeFont: null,
  fontSize: 18,
  lineHeight: 1.65,
  maxWidth: 68,
  editorCommand: "code",
  lastFolder: null,
};

export const DEFAULT_FONT_SIZE = DEFAULTS.fontSize;

const FONT_KEYS = new Set<keyof Settings>(["headingFont", "bodyFont", "codeFont"]);

function isNumericKey(key: string): key is NumericKey {
  return Object.prototype.hasOwnProperty.call(RANGES, key);
}

export function clampSetting(key: NumericKey, value: number): number {
  const { min, max } = RANGES[key];
  const clamped = Math.min(max, Math.max(min, value));
  return key === "lineHeight" ? Math.round(clamped * 100) / 100 : Math.round(clamped);
}

const isAppearance = (v: unknown): v is Appearance => v === "system" || v === "light" || v === "dark";
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const themeFor = (v: unknown, mode: Mode): ThemeId => (isThemeId(v) && supportsMode(v, mode) ? v : DEFAULT_THEMES[mode]);

/**
 * v1 → v0.2 migration. v1 stored a single `theme`. A v1 Paper user stays on Paper in both modes;
 * every other v1 theme was removed, so it falls back to the defaults. The legacy key is always
 * dropped, so the next write persists the migrated shape.
 */
export function migrate(raw: RawConfig): RawConfig {
  if (!Object.prototype.hasOwnProperty.call(raw, "theme")) return raw;
  const { theme, ...rest } = raw;
  if (theme === "paper" && rest.lightTheme === undefined && rest.darkTheme === undefined) {
    return { ...rest, lightTheme: "paper", darkTheme: "paper" };
  }
  return rest;
}

export function effectiveSettings(input: RawConfig): Settings {
  const raw = migrate(input);
  const numeric = (key: NumericKey) => {
    const value = finite(raw[key]);
    return value === null ? DEFAULTS[key] : clampSetting(key, value);
  };
  return {
    lightTheme: themeFor(raw.lightTheme, "light"),
    darkTheme: themeFor(raw.darkTheme, "dark"),
    appearance: isAppearance(raw.appearance) ? raw.appearance : DEFAULTS.appearance,
    headingFont: text(raw.headingFont),
    bodyFont: text(raw.bodyFont),
    codeFont: text(raw.codeFont),
    fontSize: numeric("fontSize"),
    lineHeight: numeric("lineHeight"),
    maxWidth: numeric("maxWidth"),
    editorCommand: text(raw.editorCommand) ?? DEFAULTS.editorCommand,
    lastFolder: text(raw.lastFolder),
  };
}

/**
 * Merges a change into the (migrated) raw config, writing only keys that differ from the defaults.
 * Keys not in the patch stay as they were. An emptied font override removes the key.
 */
export function applyPatch(raw: RawConfig, patch: Partial<Settings>): RawConfig {
  const next: RawConfig = { ...migrate(raw) };
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    let value = patch[key];
    if (value === undefined) continue;
    if (typeof value === "number" && isNumericKey(key)) value = clampSetting(key, value);
    if (typeof value === "string" && FONT_KEYS.has(key)) value = value.trim() || null;
    if (value === null || value === DEFAULTS[key]) delete next[key];
    else next[key] = value;
  }
  return next;
}

export type ParseResult = { ok: true; raw: RawConfig } | { ok: false; error: string };

export function parseConfig(source: string): ParseResult {
  if (!source.trim()) return { ok: true, raw: {} };
  try {
    const value: unknown = JSON.parse(source);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "config must be a JSON object" };
    }
    return { ok: true, raw: value as RawConfig };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function serializeConfig(raw: RawConfig): string {
  return `${JSON.stringify(raw, null, 2)}\n`;
}
```

- [ ] **Step 5: Rewrite `src/themes/apply.ts`**

```ts
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
```

- [ ] **Step 6: Switch the highlighter to the generated themes**

In `src/render/highlight.ts`:
- Delete the `SHIKI_THEMES` array and the `ShikiTheme` type.
- Replace `ThemePair` with:
  ```ts
  /** Names of the generated Shiki themes for the current light and dark picks (see shikiThemes.ts). */
  export interface ThemePair {
    light: string;
    dark: string;
  }
  ```
- Add `import { FOLIO_SHIKI_THEMES } from "./shikiThemes";`.
- Replace the whole `themes: [ … nine import(...) lines … ],` entry in `createHighlighterCore` with `themes: FOLIO_SHIKI_THEMES,`.
- Update the doc comment above `getHighlighter` to say every palette's generated theme is loaded.

Then delete `src/themes/presets.ts` and run `grep -rn "presets\|PRESETS\|PresetId\|SHIKI_THEMES" src` → expected matches only in `App.tsx`, `Toolbar.tsx` and `SettingsPanel.tsx`, which the next steps fix.

- [ ] **Step 7: Wire `App.tsx`**

Make these targeted edits; everything else in `App.tsx` stays as is.

1. Imports:
   - Change `import { applyTheme, resolveAppearance } from "../themes/apply";` to `import { activeTheme, applyTheme, resolveAppearance } from "../themes/apply";`
   - Replace `import { PRESETS } from "../themes/presets";` with `import { themesFor } from "../themes/catalog";`
   - Add `import { shikiThemeName } from "../render/shikiThemes";`
2. Replace `const doc = useDocument(render, PRESETS[settings.theme].shiki, notify);` with:

```tsx
  // Memoized: a fresh object every render would re-render the whole document.
  const shikiThemes = useMemo(
    () => ({ light: shikiThemeName(settings.lightTheme, "light"), dark: shikiThemeName(settings.darkTheme, "dark") }),
    [settings.lightTheme, settings.darkTheme],
  );
  const doc = useDocument(render, shikiThemes, notify);
  const shownTheme = activeTheme(settings, appearance);
```

3. In the `<Toolbar … />` props, replace `theme={settings.theme}` and `onTheme={(theme) => updateSettings({ theme })}` with:

```tsx
          theme={shownTheme}
          themes={themesFor(appearance)}
          onTheme={(theme) => updateSettings(appearance === "light" ? { lightTheme: theme } : { darkTheme: theme })}
```

4. In `<SettingsPanel … />`, add the prop `shownTheme={shownTheme}`.

In `src/ui/useDocument.ts`, change the comment `// Re-renders when the text changes (live reload) or the preset's Shiki pair changes (theme switch).` to `// Re-renders when the text changes (live reload) or the light/dark theme picks change.`

- [ ] **Step 8: Update `Toolbar.tsx`**

- Replace `import { PRESET_IDS, PRESETS, type PresetId } from "../themes/presets";` with `import { THEMES, type ThemeId } from "../themes/catalog";`
- In `Props`, replace `theme: PresetId;` and `onTheme: (theme: PresetId) => void;` with:
  ```ts
  /** The theme currently shown. */
  theme: ThemeId;
  /** Themes available for the current appearance; picking one sets that appearance's slot. */
  themes: ThemeId[];
  onTheme: (theme: ThemeId) => void;
  ```
- Change the `<select>`'s `onChange` cast to `as ThemeId`, and its options to:
  ```tsx
  {props.themes.map((id) => (
    <option key={id} value={id}>
      {THEMES[id].label}
    </option>
  ))}
  ```

- [ ] **Step 9: Rewrite `SettingsPanel.tsx`**

```tsx
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { RANGES, type Settings } from "../settings/schema";
import type { Appearance } from "../themes/apply";
import { THEMES, themesFor, type ThemeId } from "../themes/catalog";
import { fontSuggestions } from "../themes/fonts";

interface Props {
  settings: Settings;
  /** The theme currently shown; its fonts are what an empty font field falls back to. */
  shownTheme: ThemeId;
  invalid: string | null;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, shownTheme, invalid, onChange, onClose }: Props) {
  const theme = THEMES[shownTheme];
  return (
    <aside className="settings-panel" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <button className="icon-button" aria-label="Close settings" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {invalid && <p className="settings-warning">config.json has invalid JSON, so changes here aren't saved until you fix it. ({invalid})</p>}
      <ThemeSelect label="Light theme" value={settings.lightTheme} options={themesFor("light")} onChange={(lightTheme) => onChange({ lightTheme })} />
      <ThemeSelect label="Dark theme" value={settings.darkTheme} options={themesFor("dark")} onChange={(darkTheme) => onChange({ darkTheme })} />
      <label>
        Appearance
        <select value={settings.appearance} onChange={(e) => onChange({ appearance: e.target.value as Appearance })}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <FontField label="Heading font" value={settings.headingFont} themeDefault={theme.headingFont} suggestions={fontSuggestions("heading")} onCommit={(headingFont) => onChange({ headingFont })} />
      <FontField label="Body font" value={settings.bodyFont} themeDefault={theme.bodyFont} suggestions={fontSuggestions("body")} onCommit={(bodyFont) => onChange({ bodyFont })} />
      <FontField label="Code font" value={settings.codeFont} themeDefault={theme.codeFont} suggestions={fontSuggestions("code")} onCommit={(codeFont) => onChange({ codeFont })} />
      <RangeField label="Font size" range={RANGES.fontSize} value={settings.fontSize} format={(v) => `${v}px`} onChange={(fontSize) => onChange({ fontSize })} />
      <RangeField label="Line height" range={RANGES.lineHeight} value={settings.lineHeight} format={(v) => v.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })} />
      <RangeField label="Max width" range={RANGES.maxWidth} value={settings.maxWidth} format={(v) => `${v}ch`} onChange={(maxWidth) => onChange({ maxWidth })} />
      <TextField label="Editor command" value={settings.editorCommand} onCommit={(editorCommand) => onChange({ editorCommand })} />
      <p className="settings-hint">Leave a font empty to use the theme's. Fonts accept any installed family name. Settings live in ~/.config/folio/config.json, which you can also edit by hand.</p>
    </aside>
  );
}

interface ThemeSelectProps {
  label: string;
  value: ThemeId;
  options: ThemeId[];
  onChange: (theme: ThemeId) => void;
}

function ThemeSelect({ label, value, options, onChange }: ThemeSelectProps) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as ThemeId)}>
        {options.map((id) => (
          <option key={id} value={id}>
            {THEMES[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FontFieldProps {
  label: string;
  value: string | null;
  themeDefault: string;
  suggestions: string[];
  onCommit: (value: string | null) => void;
}

/** A font override. Empty means "use the theme's font". Commits on blur or Enter. */
function FontField({ label, value, themeDefault, suggestions, onCommit }: FontFieldProps) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const listId = `${label.toLowerCase().replace(/\s+/g, "-")}-options`;
  const commit = () => {
    const next = draft.trim() || null;
    if (next !== value) onCommit(next);
    else setDraft(value ?? "");
  };
  return (
    <label>
      {label}
      <input
        type="text"
        value={draft}
        placeholder={`Theme default (${themeDefault})`}
        list={listId}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

/** Commits on blur or Enter, so typing doesn't write config.json on every keystroke. */
function TextField({ label, value, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <label>
      {label}
      <input
        type="text"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  range: { min: number; max: number; step: number };
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function RangeField({ label, range, value, format, onChange }: RangeFieldProps) {
  return (
    <label>
      <span>
        {label} <span className="settings-value">{format(value)}</span>
      </span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
```

- [ ] **Step 10: Regenerate the render snapshot and run everything**

```bash
rm src/render/__snapshots__/gfm.html
npm test
npx tsc --noEmit
grep -c "shiki-light:#" src/render/__snapshots__/gfm.html
grep -io "shiki-light:#ff8a80" src/render/__snapshots__/gfm.html | head -1
```

Expected:
- All tests pass and tsc exits 0.
- The snapshot is regenerated with many `--shiki-light` values, including the Riso keyword color `#ff8a80`.
- Otherwise the snapshot is identical to before apart from token colors: headings, links, image rewrites, footnotes and so on. Check with `git diff --stat` and a skim of `git diff src/render/__snapshots__/gfm.html`.

- [ ] **Step 11: Build and smoke-test**

```bash
PATH="$HOME/.cargo/bin:$PATH" npx tauri build --debug --bundles app
```
Then launch-smoke the debug binary with a `/tmp/folio-smoke/spec.md` argument for about 10 seconds, the same way as earlier tasks: it should stay alive with no panic.

- [ ] **Step 12: Commit**

```bash
git add -A src
git commit -m "Switch to light and dark theme picks with generated code themes"
```

---

### Task 4: Typography and color variables in the document, and the in-app wordmark

**Files:**
- Modify: `src/styles/prose.css`, `src/styles/app.css`, `src/ui/EmptyState.tsx`

**Interfaces:**
- Consumes: CSS variables from Task 3 (`--heading`, `--heading-weight`, `--heading-tracking`, `--heading-style`, `--font-heading`, `--link`, `--link-underline`, `--quote`, `--highlight`, `--accent`).
- Produces: the visual change. No new TypeScript exports.

- [ ] **Step 1: Update `src/styles/prose.css`**

Make these exact replacements; leave the other rules as they are.

1. Replace the shared heading rule and the `h1`/`h2` sizes:

```css
.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
  margin: 1.6em 0 .5em;
  font-family: var(--font-heading);
  font-weight: var(--heading-weight);
  font-style: var(--heading-style);
  letter-spacing: var(--heading-tracking);
  line-height: 1.12;
  color: var(--heading);
}
.prose h1 { font-size: 2.4em; }
.prose h2 { font-size: 1.6em; padding-bottom: .2em; border-bottom: 1px solid var(--border); }
.prose h3 { font-size: 1.25em; }
```

`h4`, `h5` and `h6` stay as they are; `h5`/`h6` keep `color: var(--muted)`, which overrides `--heading`.

2. Replace the link rule:

```css
.prose a { color: var(--link); text-decoration-color: var(--link-underline); text-decoration-thickness: .08em; text-underline-offset: .18em; cursor: pointer; }
.prose a:hover { text-decoration-color: currentColor; }
```

3. In the blockquote rule, change `border-left: 3px solid var(--border);` to `border-left: 3px solid var(--quote);`.

4. Add after the blockquote rule:

```css
.prose mark { padding: 0 .12em; border-radius: 2px; background: var(--highlight); color: inherit; }
```

5. Replace the two find-highlight rules:

```css
::highlight(folio-find) { background-color: var(--highlight); }
::highlight(folio-find-current) { background-color: color-mix(in srgb, var(--accent) 60%, transparent); }
```

- [ ] **Step 2: Wordmark**

In `src/styles/app.css`, replace the line `.empty-state h1 { margin: 0 0 8px; font-family: var(--font-heading); font-size: 28px; }` with:

```css
/* "folio" in Fraunces Black, printed in two offset inks like the icon. Fixed brand face; colors follow the theme. */
.wordmark { position: relative; display: inline-block; margin: 0 0 14px; font-family: "Fraunces Variable", Fraunces, Georgia, serif; font-weight: 900; font-size: 72px; line-height: 1; letter-spacing: -0.02em; }
.wordmark-under { position: absolute; left: .045em; top: .035em; color: var(--accent); }
.wordmark-over { position: relative; color: var(--heading); }
```

In `src/ui/EmptyState.tsx`, replace `<h1>Folio</h1>` with:

```tsx
      <h1 className="wordmark" aria-label="Folio">
        <span className="wordmark-under" aria-hidden="true">
          folio
        </span>
        <span className="wordmark-over" aria-hidden="true">
          folio
        </span>
      </h1>
```

- [ ] **Step 3: Verify**

Run `npx tsc --noEmit && npm test`, then `npm run build`. All should pass and the build must succeed. Then do a debug app build plus launch smoke as in Task 3, Step 11.

Report which visual checks are deferred to the user:
- headings in each theme's display face
- link colors and underlines
- blockquote rules
- `<mark>` and find highlights
- the wordmark under Riso and Klein

- [ ] **Step 4: Commit**

```bash
git add src/styles src/ui/EmptyState.tsx
git commit -m "Give headings, links, and highlights each theme's own type and color"
```

---
### Task 5: App icon, wordmark SVG, and README header

**Files:**
- Create: `scripts/icon/build-icon.py`; generated and committed: `src-tauri/icons/source/folio-icon.svg`, `docs/assets/folio-wordmark.svg`, `docs/assets/folio-icon-512.png`
- Regenerate: `src-tauri/icons/*` (via `npx tauri icon`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2` (installed in Task 1).
- Produces: the icon set referenced by `src-tauri/tauri.conf.json` (`icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`), plus the README/site assets.

The controller already verified this script in a scratch copy: it produces a clean two-ink f that still reads at 32 px.

- [ ] **Step 1: Check the tools**

```bash
python3 -c "import fontTools, brotli; print('fonttools', fontTools.version)"
which rsvg-convert
ls node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2
```
Expected:
- the fontTools version prints
- the `rsvg-convert` path prints
- the font file exists

If fontTools or brotli is missing, stop and report NEEDS_CONTEXT. Don't install Python packages yourself.

- [ ] **Step 2: Create `scripts/icon/build-icon.py`**

````python
#!/usr/bin/env python3
"""Generate Folio's app icon and wordmark SVGs by outlining Fraunces Black glyphs.

The SVGs contain only paths (no <text>), so they render identically without the font.
The overlap of the two inks is a separately filled clip region, not a blend mode.

Usage:  python3 scripts/icon/build-icon.py
Needs:  fontTools with brotli (pip3 install fonttools brotli), and `npm install` (for the font).
Writes: src-tauri/icons/source/folio-icon.svg, docs/assets/folio-wordmark.svg
"""
import argparse
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"

BLUE = "#1b2a6b"
CORAL = "#ff5a4e"
OVERLAP = "#1b0f21"  # multiply(BLUE, CORAL)
PAPER = "#f6efe2"
PAPER_EDGE = "#e2d6c2"

# Coral ink sits this far right/down of the blue ink, as a fraction of the glyph height.
OFFSET_X = 28 / 600
OFFSET_Y = 22 / 600


def load_font() -> TTFont:
    font = TTFont(FONT)
    axes = {axis.axisTag for axis in font["fvar"].axes}
    wanted = {"wght": 900, "opsz": 144, "SOFT": 0, "WONK": 0}
    return instantiateVariableFont(font, {tag: value for tag, value in wanted.items() if tag in axes})


def glyph_run(font: TTFont, text: str, tracking_em: float = 0.0) -> list[tuple[str, float]]:
    """Glyph names with their x positions in font units (advance widths plus tracking; no kerning)."""
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    x, run = 0.0, []
    for ch in text:
        name = cmap[ord(ch)]
        run.append((name, x))
        x += hmtx[name][0] + tracking_em * upm
    return run


def run_bounds(font: TTFont, run) -> tuple[float, float, float, float]:
    glyphs = font.getGlyphSet()
    pen = BoundsPen(glyphs)
    for name, x in run:
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
    return pen.bounds


def run_path(font: TTFont, run, scale: float, tx: float, ty: float) -> str:
    """SVG path data for the run, scaled and flipped into SVG's y-down space."""
    glyphs = font.getGlyphSet()
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    for name, x in run:
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, tx + x * scale, ty)))
    return pen.getCommands()


def two_ink(font: TTFont, run, height: float, left: float, top: float) -> tuple[str, str, float, float]:
    """Blue and coral paths for a run whose ink box is `height` tall at (left, top). Returns (blue, coral, width, total_height)."""
    x_min, y_min, x_max, y_max = run_bounds(font, run)
    scale = height / (y_max - y_min)
    dx, dy = OFFSET_X * height, OFFSET_Y * height
    tx = left - x_min * scale
    ty = top + y_max * scale
    blue = run_path(font, run, scale, tx, ty)
    coral = run_path(font, run, scale, tx + dx, ty + dy)
    return blue, coral, (x_max - x_min) * scale + dx, height + dy


def inks(blue: str, coral: str) -> str:
    return (
        f'  <defs><clipPath id="coral-ink"><path d="{coral}"/></clipPath></defs>\n'
        f'  <path d="{coral}" fill="{CORAL}"/>\n'
        f'  <path d="{blue}" fill="{BLUE}"/>\n'
        f'  <path d="{blue}" fill="{OVERLAP}" clip-path="url(#coral-ink)"/>\n'
    )


def icon_svg(font: TTFont) -> str:
    run = glyph_run(font, "f")
    height = 600.0
    _, _, width, _ = two_ink(font, run, height, 0, 0)
    blue, coral, _, _ = two_ink(font, run, height, 512 - width / 2, 248)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
        f'  <rect x="100" y="100" width="824" height="824" rx="185" fill="{PAPER}"/>\n'
        f'  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="{PAPER_EDGE}" stroke-width="3"/>\n'
        + inks(blue, coral)
        + "</svg>\n"
    )


def wordmark_svg(font: TTFont) -> str:
    run = glyph_run(font, "folio", tracking_em=-0.02)
    pad, height = 8.0, 160.0
    blue, coral, width, total = two_ink(font, run, height, pad, pad)
    w, h = round(width + 2 * pad), round(total + 2 * pad)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="folio">\n'
        + inks(blue, coral)
        + "</svg>\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=ROOT, help="repo root to write into (default: this repo)")
    args = parser.parse_args()
    font = load_font()
    icon = args.out_dir / "src-tauri/icons/source/folio-icon.svg"
    wordmark = args.out_dir / "docs/assets/folio-wordmark.svg"
    for path, svg in ((icon, icon_svg(font)), (wordmark, wordmark_svg(font))):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(svg)
        print(f"wrote {path.relative_to(args.out_dir)}")


if __name__ == "__main__":
    main()
````

- [ ] **Step 3: Generate and inspect**

```bash
python3 scripts/icon/build-icon.py
grep -c "<text" src-tauri/icons/source/folio-icon.svg docs/assets/folio-wordmark.svg
mkdir -p /tmp/folio-icon-preview
for s in 1024 128 32 16; do rsvg-convert -w $s -h $s src-tauri/icons/source/folio-icon.svg -o /tmp/folio-icon-preview/icon-$s.png; done
rsvg-convert -h 120 docs/assets/folio-wordmark.svg -o /tmp/folio-icon-preview/wordmark.png
rsvg-convert -w 512 -h 512 src-tauri/icons/source/folio-icon.svg -o docs/assets/folio-icon-512.png
```
Expected:
- The script prints two "wrote" lines.
- `grep -c "<text"` prints `0` for both files.
- The previews render. Open `/tmp/folio-icon-preview/icon-1024.png` and `icon-32.png` with your image-reading tool and confirm:
  - a paper-colored rounded tile
  - a lowercase f with a blue left edge, a coral offset to the lower right, and a dark overlap
  - nothing clipped by the tile edge

- [ ] **Step 4: Regenerate the app icon set**

```bash
git status --short src-tauri/icons
npx tauri icon src-tauri/icons/source/folio-icon.svg
git status --short src-tauri/icons
```
- If the command created `src-tauri/icons/android/` or `src-tauri/icons/ios/`, delete those directories (Folio is macOS-only).
- Keep every regenerated file at the top level of `src-tauri/icons/`.
- Confirm the five files listed in `tauri.conf.json` exist and changed.
- Run `file src-tauri/icons/icon.icns`; it should report a Mac OS X icon.

- [ ] **Step 5: README header**

Insert at the very top of `README.md`, above `# Folio`:

```markdown
<p align="center"><img src="docs/assets/folio-wordmark.svg" alt="folio" width="260"></p>

```

- [ ] **Step 6: Build and smoke**

Run `PATH="$HOME/.cargo/bin:$PATH" npx tauri build --debug --bundles app`, then the launch smoke from the earlier tasks. Then run `file src-tauri/target/debug/bundle/macos/Folio.app/Contents/Resources/icon.icns`: the bundle must carry the new icon.

- [ ] **Step 7: Commit**

```bash
git add scripts/icon src-tauri/icons docs/assets README.md
git commit -m "Add riso-printed f app icon and folio wordmark"
```

---

### Task 6: Version 0.2.0 and release build

**Files:**
- Modify: `package.json` (`"version"`), `src-tauri/Cargo.toml` (`version`), `src-tauri/tauri.conf.json` (`"version"`), `src-tauri/Cargo.lock` (updated by the build)

**Interfaces:**
- Consumes: everything above.
- Produces: `src-tauri/target/release/bundle/dmg/Folio_0.2.0_aarch64.dmg`.
- Pushing and the GitHub release are done by the controller after the user approves. This task never pushes and never touches `/Applications` or `~/.config/folio`.

- [ ] **Step 1: Bump the version to 0.2.0** in all three files. `package.json` and `tauri.conf.json` change `"version": "0.1.0"`; `Cargo.toml` changes `version = "0.1.0"`.

- [ ] **Step 2: Full verification**

```bash
npm test && npx tsc --noEmit && (cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test)
PATH="$HOME/.cargo/bin:$PATH" npx tauri build --bundles dmg
ls src-tauri/target/release/bundle/dmg/
hdiutil verify src-tauri/target/release/bundle/dmg/Folio_0.2.0_aarch64.dmg
```
Expected:
- all tests pass
- `Folio_0.2.0_aarch64.dmg` exists
- its checksum is VALID

Then launch-smoke the release binary (`src-tauri/target/release/bundle/macos/Folio.app/Contents/MacOS/folio /tmp/folio-smoke/spec.md`) for about 10 seconds.

- [ ] **Step 3: Commit**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Release 0.2.0"
```

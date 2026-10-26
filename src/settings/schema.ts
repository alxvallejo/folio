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
  /** `~`-abbreviated posts folder. Only Rust changes it, so patches never write it. */
  postsFolder: string | null;
  /** Check GitHub for a new Folio 30 seconds after launch. */
  autoUpdateCheck: boolean;
  /** Set once Folio has asked macOS to make it the default Markdown app; never shown in Settings. */
  defaultAppAsked: boolean;
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
  postsFolder: null,
  autoUpdateCheck: true,
  defaultAppAsked: false,
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
    postsFolder: text(raw.postsFolder),
    autoUpdateCheck: typeof raw.autoUpdateCheck === "boolean" ? raw.autoUpdateCheck : DEFAULTS.autoUpdateCheck,
    defaultAppAsked: typeof raw.defaultAppAsked === "boolean" ? raw.defaultAppAsked : DEFAULTS.defaultAppAsked,
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
    if (value === undefined || key === "postsFolder") continue;
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

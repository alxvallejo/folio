import type { Appearance } from "../themes/apply";
import { PRESETS, isPresetId, type PresetId } from "../themes/presets";

export interface Settings {
  theme: PresetId;
  appearance: Appearance;
  bodyFont: string;
  codeFont: string;
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

const BASE = {
  theme: "paper",
  appearance: "system",
  fontSize: 18,
  lineHeight: 1.65,
  maxWidth: 68,
  editorCommand: "code",
  lastFolder: null,
} as const;

export const DEFAULT_FONT_SIZE = BASE.fontSize;

export function defaultsFor(theme: PresetId): Settings {
  return { ...BASE, theme, bodyFont: PRESETS[theme].bodyFont, codeFont: PRESETS[theme].codeFont };
}

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

export function effectiveSettings(raw: RawConfig): Settings {
  const theme = isPresetId(raw.theme) ? raw.theme : BASE.theme;
  const defaults = defaultsFor(theme);
  const numeric = (key: NumericKey) => {
    const value = finite(raw[key]);
    return value === null ? defaults[key] : clampSetting(key, value);
  };
  return {
    theme,
    appearance: isAppearance(raw.appearance) ? raw.appearance : defaults.appearance,
    bodyFont: text(raw.bodyFont) ?? defaults.bodyFont,
    codeFont: text(raw.codeFont) ?? defaults.codeFont,
    fontSize: numeric("fontSize"),
    lineHeight: numeric("lineHeight"),
    maxWidth: numeric("maxWidth"),
    editorCommand: text(raw.editorCommand) ?? defaults.editorCommand,
    lastFolder: text(raw.lastFolder),
  };
}

/**
 * Merges a change into the raw config, writing only keys that differ from the defaults.
 * Font defaults come from the resulting preset. Keys not in the patch are left exactly as
 * they were, so switching theme never turns the old preset's fonts into overrides.
 */
export function applyPatch(raw: RawConfig, patch: Partial<Settings>): RawConfig {
  const next: RawConfig = { ...raw };
  const defaults = defaultsFor(patch.theme ?? effectiveSettings(raw).theme);
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    let value = patch[key];
    if (value === undefined) continue;
    if (typeof value === "number" && isNumericKey(key)) value = clampSetting(key, value);
    const isDefault = key === "theme" ? value === BASE.theme : value === defaults[key];
    if (value === null || isDefault) delete next[key];
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

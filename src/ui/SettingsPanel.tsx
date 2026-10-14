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
      <label className="settings-check">
        <input type="checkbox" checked={settings.autoUpdateCheck} onChange={(e) => onChange({ autoUpdateCheck: e.target.checked })} />
        Check for updates automatically
      </label>
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

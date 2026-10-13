import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { RANGES, type Settings } from "../settings/schema";
import type { Appearance } from "../themes/apply";
import { BODY_FONTS, CODE_FONTS } from "../themes/fonts";
import { PRESET_IDS, PRESETS, type PresetId } from "../themes/presets";

interface Props {
  settings: Settings;
  invalid: string | null;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, invalid, onChange, onClose }: Props) {
  return (
    <aside className="settings-panel" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <button className="icon-button" aria-label="Close settings" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {invalid && <p className="settings-warning">config.json has invalid JSON, so changes here aren't saved until you fix it. ({invalid})</p>}
      <label>
        Theme
        <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as PresetId })}>
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {PRESETS[id].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Appearance
        <select value={settings.appearance} onChange={(e) => onChange({ appearance: e.target.value as Appearance })}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <TextField label="Body font" value={settings.bodyFont} suggestions={BODY_FONTS.map((f) => f.label)} onCommit={(bodyFont) => onChange({ bodyFont })} />
      <TextField label="Code font" value={settings.codeFont} suggestions={CODE_FONTS.map((f) => f.label)} onCommit={(codeFont) => onChange({ codeFont })} />
      <RangeField label="Font size" range={RANGES.fontSize} value={settings.fontSize} format={(v) => `${v}px`} onChange={(fontSize) => onChange({ fontSize })} />
      <RangeField label="Line height" range={RANGES.lineHeight} value={settings.lineHeight} format={(v) => v.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })} />
      <RangeField label="Max width" range={RANGES.maxWidth} value={settings.maxWidth} format={(v) => `${v}ch`} onChange={(maxWidth) => onChange({ maxWidth })} />
      <TextField label="Editor command" value={settings.editorCommand} onCommit={(editorCommand) => onChange({ editorCommand })} />
      <p className="settings-hint">Fonts accept any installed family name. Settings live in ~/.config/folio/config.json, which you can also edit by hand.</p>
    </aside>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  suggestions?: string[];
  onCommit: (value: string) => void;
}

/** Commits on blur or Enter, so typing a font name doesn't write config.json on every keystroke. */
function TextField({ label, value, suggestions, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const listId = suggestions ? `${label.toLowerCase().replace(/\s+/g, "-")}-options` : undefined;
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
        list={listId}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
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

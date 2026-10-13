import { PanelLeft, PanelRight, Search, Settings2, SquarePen } from "lucide-react";
import { THEMES, type ThemeId } from "../themes/catalog";

interface Props {
  title: string;
  /** The theme currently shown. */
  theme: ThemeId;
  /** Themes available for the current appearance; picking one sets that appearance's slot. */
  themes: ThemeId[];
  onTheme: (theme: ThemeId) => void;
  canToggleSidebar: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  hasDocument: boolean;
  onFind: () => void;
  onOpenInEditor: () => void;
  tocOpen: boolean;
  onToggleToc: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
}

export function Toolbar(props: Props) {
  return (
    <header className="toolbar">
      <button
        className="icon-button"
        title="Toggle sidebar (⌘\)"
        aria-pressed={props.sidebarOpen}
        disabled={!props.canToggleSidebar}
        onClick={props.onToggleSidebar}
      >
        <PanelLeft size={16} />
      </button>
      <div className="toolbar-title">{props.title}</div>
      <select className="theme-select" aria-label="Theme" value={props.theme} onChange={(e) => props.onTheme(e.target.value as ThemeId)}>
        {props.themes.map((id) => (
          <option key={id} value={id}>
            {THEMES[id].label}
          </option>
        ))}
      </select>
      <button className="icon-button" title="Find (⌘F)" disabled={!props.hasDocument} onClick={props.onFind}>
        <Search size={16} />
      </button>
      <button className="icon-button" title="Open in editor (⌘E)" disabled={!props.hasDocument} onClick={props.onOpenInEditor}>
        <SquarePen size={16} />
      </button>
      <button className="icon-button" title="Toggle contents (⌥⌘\)" aria-pressed={props.tocOpen} onClick={props.onToggleToc}>
        <PanelRight size={16} />
      </button>
      <button className="icon-button" title="Settings (⌘,)" aria-pressed={props.settingsOpen} onClick={props.onSettings}>
        <Settings2 size={16} />
      </button>
    </header>
  );
}
